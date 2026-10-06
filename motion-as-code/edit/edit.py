"""Edit as code: a video call (or any talking-head recording) cut into a vertical reel, from an EDL.

    uv run --no-project --with numpy python edit/edit.py edit/gianni/edl.json      # -> out/<name>.mp4
    uv run --no-project --with numpy python edit/edit.py edit/gianni/edl.json --preview 0,12   # a quick look at 0-12 s

The EDL (JSON, one folder per edit) says:
- the source video and its transcript (Whisper JSON with word times, made by edit/transcribe.py);
- the framings: crops of the source (x, y, w, h in source px), e.g. both tiles of a call, or one face;
- the sections, each with a title, a music style (analysis/music.py STYLES) and its segments: stretches of
  the source (in, out, in source seconds) and the framing each is shown in. Switching between a wide and a
  tight framing on every cut is what hides the jump cuts;
- the stickers: a word of the speech that pops a big label (numbers, results);
- the end card: brand, call to action, small print.

Everything else is derived: the cut list, the captions (every word kept lights up on its own time), the
cards under the video, the music arranged on the sections, the effects on cuts and stickers, the speech
cleaned up (80 Hz high-pass, 3:1 compression) and the mix at -14 LUFS, true peak -1.5 dBTP. Video in ffmpeg
(trim, crop, scale, concat), graphics in two ASS layers (under and over the video), sound in numpy.

Style: the joinscalers.com neo-brutalist look. Cream paper, black borders and hard shadows, yellow and violet,
Space Grotesk. Text stays between 250 px from the top and 350 px from the bottom, where the app does not cover it.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(KIT, "analysis"))
import music  # noqa: E402
import sfx_mix as M  # noqa: E402
from vertical import pages  # noqa: E402

W, H = 1080, 1920
SR = M.SR
FONTS = os.path.join(KIT, "app", "public", "fonts", "spacegrotesk")
# libass matches the legacy family names: the Bold face is "Space Grotesk" + bold, the 500 is its own family
BOLD, MEDIUM = "Space Grotesk", "Space Grotesk Medium"
CREAM, INK, YELLOW, VIOLET, LILAC, WHITE = "fffdf5", "000000", "ffd93d", "8b5cf6", "c4b5fd", "ffffff"
MEDIA_TOP, MEDIA_BOTTOM, MEDIA_W = 440, 1330, 960  # the box the video card fits in
TITLE_Y, CAPTION_Y = 270, 1384
BORDER, SHADOW = 7, 16  # the cards' black border and hard shadow, px
PAD = 18  # inside a label box


def col(hex6):
    """'rrggbb' -> ASS 'BBGGRR'."""
    return (hex6[4:6] + hex6[2:4] + hex6[0:2]).upper()


def ts(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def esc(s):
    return s.replace("{", "(").replace("}", ")").replace("\n", "\\N")


# ------------------------------------------------------------------ the cut list
def load(edl_path):
    edl = json.load(open(edl_path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(edl_path))
    edl["_base"] = base
    for k in ("source", "transcript"):
        edl[k] = os.path.normpath(os.path.join(base, edl[k]))
    return edl


def quiet(edl):
    """The source's loudness every 10 ms (dB), to put every cut in a pause."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", edl["source"], "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    m = len(x) // 160
    return 10 * np.log10((x[: m * 160].reshape(m, 160) ** 2).mean(axis=1) + 1e-10)


def source_words(edl):
    """The transcript's words, cleaned: "l" + "'anno" joined back, and the EDL's corrections applied
    (["la I", "l'IA"]: words the transcript got wrong)."""
    tr = json.load(open(edl["transcript"], encoding="utf-8"))
    src = []
    for w in (dict(w) for s in tr["segments"] for w in s["words"] if w["w"]):
        if w["w"].startswith("'") and src:
            src[-1]["w"] += w["w"]
            src[-1]["end"] = w["end"]
        else:
            src.append(w)
    strip = lambda x: x.lower().strip(".,;:!?…")
    for wrong, right in edl.get("fix", []):
        want = wrong.lower().split()
        i = 0
        while i + len(want) <= len(src):
            if [strip(src[i + j]["w"]) for j in range(len(want))] == want:
                last = src[i + len(want) - 1]["w"]
                tail = last[len(last.rstrip(".,;:!?…")):]
                src[i:i + len(want)] = [{"w": right + tail, "start": src[i]["start"], "end": src[i + len(want) - 1]["end"]}]
            i += 1
    return src


def cuts(edl):
    """[(section index, segment, edit start, edit end, words)]. A segment keeps the whole words between its in
    and out; the cut itself goes in the quietest 10 ms of the pause before the first word and after the last
    (never inside a word), then outward onto the frame grid, so picture and sound cut together."""
    fps = edl.get("fps", 30)
    src = source_words(edl)
    db = quiet(edl)

    def quietest(a, b):
        i, j = max(0, int(a * 100)), min(len(db), int(np.ceil(b * 100)) + 1)
        return (i + int(np.argmin(db[i:j]))) / 100 if j > i else a
    out, t = [], 0.0
    for si, sec in enumerate(edl["sections"]):
        for seg in sec["segments"]:
            ks = [k for k, w in enumerate(src) if w["start"] >= seg["in"] - 0.08 and w["end"] <= seg["out"] + 0.08]
            if not ks:
                raise SystemExit(f"no words between {seg['in']} and {seg['out']}")
            first, last = src[ks[0]], src[ks[-1]]
            prev_end = src[ks[0] - 1]["end"] if ks[0] > 0 else 0.0
            next_start = src[ks[-1] + 1]["start"] if ks[-1] + 1 < len(src) else last["end"] + 0.5
            a = quietest(max(prev_end, first["start"] - 0.35), first["start"])
            b = quietest(last["end"], min(next_start, last["end"] + 0.35))
            a, b = np.floor(a * fps) / fps, np.ceil(b * fps) / fps
            words = [dict(src[k]) for k in ks]
            out.append((si, dict(seg, **{"in": a, "out": b}), t, t + (b - a), words))
            t += b - a
    return out, t


def card(edl, framing):
    """The video card for a framing: (x, y, w, h) on the canvas, as big as the media box allows."""
    x, y, w, h = edl["framings"][framing]
    s = min(MEDIA_W / w, (MEDIA_BOTTOM - MEDIA_TOP) / h)
    cw, ch = int(w * s) // 2 * 2, int(h * s) // 2 * 2
    return (W - cw) // 4 * 2, (MEDIA_TOP + (MEDIA_BOTTOM - MEDIA_TOP - ch) // 2) // 2 * 2, cw, ch


def words_in(cl):
    """The words each cut keeps, on the edit's clock: [{w, start, end, cut}]."""
    out = []
    for k, (_, seg, t0, t1, words) in enumerate(cl):
        for w in words:
            a = t0 + max(0.0, w["start"] - seg["in"])
            b = min(t1, t0 + (w["end"] - seg["in"]))
            out.append({"w": w["w"], "start": a, "end": max(a + 0.05, b), "cut": k})
    return out


# ------------------------------------------------------------------ graphics (ASS)
def styles():
    S = "Style: {},{},{},&H00{},&H00{},&H00{},&H00{},{},0,0,0,100,100,{},0,{},{},{},{},{},{},{},1"
    rows = [
        # name, font, size, primary, secondary, outline(box), back(shadow), bold, spacing, borderstyle, outline, shadow, align, ml, mr, mv
        ("TitleBack", BOLD, 62, INK, INK, INK, INK, -1, 0, 3, PAD + BORDER, SHADOW - 4, 8, 80, 80, TITLE_Y),
        ("Title", BOLD, 62, INK, INK, YELLOW, INK, -1, 0, 3, PAD, 0, 8, 80, 80, TITLE_Y),
        ("Cap", BOLD, 70, INK, INK, CREAM, INK, -1, 0, 1, 0, 0, 8, 70, 70, CAPTION_Y),
        ("Chip", MEDIUM, 30, WHITE, WHITE, INK, INK, 0, 2, 3, 10, 0, 7, 0, 0, 0),
        ("StkBack", BOLD, 96, INK, INK, INK, INK, -1, 0, 3, PAD + BORDER, SHADOW, 5, 0, 0, 0),
        ("Stk", BOLD, 96, INK, INK, YELLOW, INK, -1, 0, 3, PAD, 0, 5, 0, 0, 0),
        ("Small", MEDIUM, 32, "5a5a5a", "5a5a5a", CREAM, INK, 0, 0, 1, 0, 0, 2, 110, 110, 380),
        ("Shape", BOLD, 20, INK, INK, INK, INK, 0, 0, 1, 0, 0, 7, 0, 0, 0),
    ]
    return "\n".join(S.format(n, f, sz, col(p), col(s2), col(o), col(b), bd, sp, bs, ol, sh, al, ml, mr, mv)
                     for n, f, sz, p, s2, o, b, bd, sp, bs, ol, sh, al, ml, mr, mv in rows)


def header():
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{styles()}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ev(layer, t0, t1, style, text):
    return f"Dialogue: {layer},{ts(t0)},{ts(t1)},{style},,0,0,0,,{text}"


def boxed(t0, t1, back, front, text, tags="", layer=0, front_tags=""):
    """A label in a box with a black border and a hard shadow: a bigger black box (and its shadow) under the
    coloured one. The same text on both layers, so the boxes match whatever the text is."""
    return [ev(layer, t0, t1, back, tags + text), ev(layer + 1, t0, t1, front, tags + front_tags + text)]


POP = "\\fscx70\\fscy70\\t(0,140,\\fscx106\\fscy106)\\t(140,240,\\fscx100\\fscy100)"


def under_layer(edl, cl):
    """The cards under the video: a black frame and its hard shadow for every cut."""
    out = []
    for _, seg, t0, t1, _ in cl:
        x, y, w, h = card(edl, seg["framing"])
        b, s = BORDER, SHADOW
        rects = [(x - b + s, y - b + s, x + w + b + s, y + h + b + s), (x - b, y - b, x + w + b, y + h + b)]
        d = " ".join(f"m {a} {c} l {e} {c} l {e} {f} l {a} {f}" for a, c, e, f in rects)
        out.append(ev(0, t0, t1, "Shape", f"{{\\an7\\pos(0,0)\\p1\\1c&H{col(INK)}&}}{d}{{\\p0}}"))
    return out


def over_layer(edl, cl, words, total):
    out = []
    sec_t = {}
    for si, _, t0, t1, _ in cl:
        a, b = sec_t.get(si, (t0, t1))
        sec_t[si] = (min(a, t0), max(b, t1))
    # section titles: they pop in on the section's first cut and stay with it
    for si, sec in enumerate(edl["sections"]):
        if si in sec_t and sec.get("title"):
            t0, t1 = sec_t[si]
            out += boxed(t0, t1, "TitleBack", "Title", esc(sec["title"]), "{\\fad(60,100)" + POP + "}")
    # the speaker's name on the tight framings
    for _, seg, t0, t1, _ in cl:
        name = edl.get("names", {}).get(seg["framing"])
        if name:
            x, y, _, _ = card(edl, seg["framing"])
            out.append(ev(5, t0, t1, "Chip", f"{{\\pos({x + 22},{y + 22})\\fad(80,0)}}{esc(name)}"))
    # captions: pages of up to two lines inside each cut, every word dim -> violet while said -> ink
    for k in range(len(cl)):
        ws = [w for w in words if w["cut"] == k]
        pp = pages(ws) if ws else []
        for i, p in enumerate(pp):
            t0 = p[0]["start"] - 0.12
            t1 = pp[i + 1][0]["start"] - 0.12 if i + 1 < len(pp) else cl[k][3]
            t0 = max(t0, cl[k][2])
            parts = []
            for w in p:
                a, b = int((w["start"] - t0) * 1000), int((w["end"] - t0) * 1000)
                parts.append(f"{{\\1c&H{col(INK)}&\\1a&HA0&\\t({a},{a + 50},\\1c&H{col(VIOLET)}&\\1a&H00&)"
                             f"\\t({b + 60},{b + 220},\\1c&H{col(INK)}&)}}" + esc(w["w"]))
            out.append(ev(4, t0, t1, "Cap", " ".join(parts)))
    # stickers: a word pops a label next to the video, slightly tilted, for ~1.8 s
    for st in edl.get("stickers", []):
        hit = next((w for w in words if st["word"].lower() in w["w"].lower() and (st.get("after", 0) <= w["start"])), None)
        if not hit:
            raise SystemExit(f"sticker word not found in the cut: {st['word']!r}")
        t0 = hit["start"] - 0.05
        t1 = t0 + st.get("dur", 1.8)
        x, y = st.get("pos", [W * 0.68, MEDIA_TOP + 150])
        # (kept inside the frame: half the widest line, Space Grotesk Bold caps ~0.66 em, plus the box)
        half = max(len(st["text"]) * 96, len(st.get("sub", "")) * 40) * 0.33 + PAD + BORDER
        x = min(max(x, half + 40), W - half - 40 - SHADOW)
        front = "Stk"
        tags = f"{{\\pos({x:.0f},{y:.0f})\\frz{st.get('tilt', -4)}\\fad(0,140)" + POP + "}"
        text = esc(st["text"]) + (f"\\N{{\\fs40}}{esc(st['sub'])}" if st.get("sub") else "")
        violet = st.get("color") == "violet"
        out += boxed(t0, t1, "StkBack", front, text, tags, layer=6,
                     front_tags=(f"{{\\3c&H{col(VIOLET)}&\\1c&H{col(WHITE)}&}}" if violet else ""))
        st["_t"] = t0
    # the end card
    endc = edl.get("end")
    if endc:
        t0 = total - endc["dur"]
        out += boxed(t0 + 0.1, total, "StkBack", "Stk", esc(endc["brand"]), "{\\an5\\pos(540,760)\\fs120" + POP + "}", layer=6)
        if endc.get("line"):
            out.append(ev(8, t0 + 0.45, total, "Cap", f"{{\\an5\\pos(540,960)\\fad(150,0)}}{esc(endc['line'])}"))
        if endc.get("cta"):
            out += boxed(t0 + 0.8, total, "TitleBack", "Title", esc(endc["cta"]),
                         "{\\an5\\pos(540,1140)" + POP + "}", layer=9, front_tags=f"{{\\3c&H{col(VIOLET)}&\\1c&H{col(WHITE)}&}}")
        if endc.get("small"):
            out.append(ev(11, t0 + 0.8, total, "Small", f"{{\\fad(200,0)}}{esc(endc['small'])}"))
    return out


def background(path):
    """Cream paper with a faint dot grid (the site's pegboard)."""
    img = np.empty((H, W, 3), np.uint8)
    img[:] = [int(CREAM[i:i + 2], 16) for i in (0, 2, 4)]
    yy, xx = np.mgrid[0:H, 0:W]
    dot = ((xx % 36 - 18) ** 2 + (yy % 36 - 18) ** 2) <= 4
    img[dot] = (img[dot] * 0.88).astype(np.uint8)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-i", "-", path],
                   input=img.tobytes(), check=True)


# ------------------------------------------------------------------ sound
def speech_track(edl, cl, total, path):
    """The kept stretches of the source's sound, back to back (5 ms fades at every cut: no clicks), then silence."""
    args = ["ffmpeg", "-v", "error", "-y"]
    for _, seg, _, _, _ in cl:
        args += ["-ss", f"{seg['in']:.3f}", "-t", f"{seg['out'] - seg['in']:.3f}", "-i", edl["source"]]
    chains = []
    for k, (_, seg, _, _, _) in enumerate(cl):
        d = seg["out"] - seg["in"]
        chains.append(f"[{k}:a]aresample={SR},asetpts=PTS-STARTPTS,atrim=0:{d:.4f},afade=t=in:d=0.005,afade=t=out:st={max(0, d - 0.005):.4f}:d=0.005[a{k}]")
    graph = ";".join(chains) + ";" + "".join(f"[a{k}]" for k in range(len(cl))) + f"concat=n={len(cl)}:v=0:a=1,apad=whole_dur={total:.4f}[out]"
    subprocess.run(args + ["-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", str(SR), path], check=True)


def mix(edl, cl, total, speech_path, out_path):
    voice = M.compress(M.highpass(M.load_audio(speech_path), 80.0))
    n = len(voice)
    # the music: one phrase over the talk, a style per section; the end card gets its own downbeat
    secs = []
    for si, _, t0, _, _ in cl:
        if not secs or secs[-1][1] != si:
            secs.append((t0, si))
    endc = edl.get("end")
    t_end = total - endc["dur"] if endc else total
    phrases = [(secs[0][0], t_end, [(t, edl["sections"][si].get("music", "light")) for t, si in secs])]
    if endc:
        phrases.append((t_end, total - 0.4, [(t_end, "drive")]))
    bed, send = music.bed({}, n, phrases)
    bed, send = bed * 10 ** (edl.get("music_db", -24) / 20), send * 10 ** (edl.get("music_db", -24) / 20)
    # effects: a whoosh on every new section, a stamp and a pop on every sticker, a hit on the end card
    cues = [(t - 0.12, "whoosh_short", -18, 0.0) for t, _ in secs[1:]]
    cues += [(st["_t"], "stamp", -16, 0.2) for st in edl.get("stickers", []) if "_t" in st]
    cues += [(st["_t"] + 0.02, "pop", -16, 0.2) for st in edl.get("stickers", []) if "_t" in st]
    if endc:
        cues += [(t_end, "impact_low", -14, 0.0), (t_end + 0.1, "bloom_hit", -18, 0.0), (t_end + 0.8, "pop", -16, 0.0)]
    fx = np.zeros((n + 3 * SR, 2))
    bank = {}
    for t, name, db, pan in cues:
        s = bank.setdefault(name, M.load_audio(os.path.join(KIT, "audio", "sfx", f"{name}.wav")))
        i = int(round(t * SR))
        if 0 <= i < n:
            th = (pan + 1) * np.pi / 4
            fx[i:i + len(s)] += s * 10 ** (db / 20) * np.array([np.cos(th), np.sin(th)]) * np.sqrt(2)
    fx = fx[:n]
    verb = music.room(fx * 0.15 + send) * 10 ** (-6 / 20)
    env = M.voice_envelope(voice)[:, None]
    mixed = voice + (fx + verb) * 10 ** (-6 * env / 20) + bed * 10 ** (-10 * env / 20)
    gain = 1.0
    for _ in range(2):
        out = M.limit(mixed * gain)
        gain *= 10 ** ((M.TARGET_LUFS - M.integrated_lufs(out)) / 20)
    out = M.limit(mixed * gain)
    M.write_wav(out_path, out)
    return M.integrated_lufs(out), 20 * np.log10(M.true_peaks(out).max())


# ------------------------------------------------------------------ picture
def render(edl, cl, total, under, over, bg, audio, out, preview=None):
    fps = edl.get("fps", 30)
    args = ["ffmpeg", "-v", "error", "-stats", "-y", "-loop", "1", "-framerate", str(fps), "-t", f"{total:.3f}", "-i", bg]
    for _, seg, _, _, _ in cl:
        args += ["-ss", f"{seg['in']:.3f}", "-t", f"{seg['out'] - seg['in']:.3f}", "-i", edl["source"]]
    args += ["-i", audio]
    chains = []
    for k, (_, seg, t0, t1, _) in enumerate(cl):
        x, y, w, h = edl["framings"][seg["framing"]]
        cx, cy, cw, ch = card(edl, seg["framing"])
        n_frames = round((t1 - t0) * fps)
        chains.append(f"[{k + 1}:v]fps={fps},setpts=PTS-STARTPTS,trim=end_frame={n_frames},crop={w}:{h}:{x}:{y},"
                      f"scale={cw}:{ch}:flags=lanczos,unsharp=5:5:0.6:5:5:0,setsar=1,format=yuva420p,"
                      f"pad={W}:{H}:{cx}:{cy}:color=black@0[v{k}]")
    endc = edl.get("end")
    concat_in = "".join(f"[v{k}]" for k in range(len(cl)))
    n_in = len(cl)
    if endc:
        chains.append(f"color=c=black@0:s={W}x{H}:r={fps}:d={endc['dur']:.3f},format=yuva420p[vend]")
        concat_in += "[vend]"
        n_in += 1
    fontsdir = FONTS
    graph = ";".join(chains) + f";{concat_in}concat=n={n_in}:v=1:a=0[vid];" \
        f"[0:v]format=yuv420p,ass={under}:fontsdir={fontsdir}[bg];[bg][vid]overlay=0:0:format=auto[c];" \
        f"[c]ass={over}:fontsdir={fontsdir},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p[v]"
    a_idx = len(cl) + 1
    args += ["-filter_complex", graph, "-map", "[v]", "-map", f"{a_idx}:a"]
    if preview:
        args += ["-ss", str(preview[0]), "-to", str(preview[1])]
    args += ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps),
             "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", out]
    subprocess.run(args, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edl")
    ap.add_argument("--out", help="default: out/<edl folder name>.mp4")
    ap.add_argument("--preview", help="from,to (s): only that stretch of the picture (sound and graphics as in the full edit)")
    ap.add_argument("--list", action="store_true", help="print the cut list and the captions' words, then stop")
    a = ap.parse_args()

    edl = load(a.edl)
    cl, talk = cuts(edl)
    total = talk + (edl["end"]["dur"] if edl.get("end") else 0.0)
    words = words_in(cl)
    if a.list:
        for si, seg, t0, t1, _ in cl:
            said = " ".join(w["w"] for w in words if t0 <= w["start"] < t1)
            print(f"{t0:6.2f}-{t1:6.2f}  [{si}] {seg['framing']:7s} src {seg['in']:7.2f}-{seg['out']:7.2f}  {said}")
        print(f"total {total:.2f} s")
        return
    name = os.path.basename(edl["_base"])
    out = a.out or os.path.join(KIT, "out", f"{name}.mp4")
    tmp = tempfile.mkdtemp(prefix="edit-")
    try:
        over = over_layer(edl, cl, words, total)  # (also finds the stickers' times, the mix needs them)
        under_p, over_p, bg_p = (os.path.join(tmp, f) for f in ("under.ass", "over.ass", "bg.png"))
        open(under_p, "w", encoding="utf-8").write(header() + "\n".join(under_layer(edl, cl)) + "\n")
        open(over_p, "w", encoding="utf-8").write(header() + "\n".join(over) + "\n")
        background(bg_p)
        speech_p, mix_p = os.path.join(tmp, "speech.wav"), os.path.join(tmp, "mix.wav")
        speech_track(edl, cl, total, speech_p)
        lufs, tp = mix(edl, cl, total, speech_p, mix_p)
        print(f"{len(cl)} cuts, {total:.1f} s · mix {lufs:.1f} LUFS, true peak {tp:.1f} dBTP")
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        render(edl, cl, total, under_p, over_p, bg_p, mix_p, out, [float(v) for v in a.preview.split(",")] if a.preview else None)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"wrote {os.path.relpath(out, KIT)}")


if __name__ == "__main__":
    main()
