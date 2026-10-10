"""The vertical cut for Reels and Shorts (1080x1920): the film at full width, the voice as big karaoke captions.

    python3 analysis/vertical.py                    # out/motion-as-code_sfx.mp4 -> out/motion-as-code_9x16.mp4
    python3 analysis/vertical.py --video out/motion-as-code.mp4 --out out/bozza_9x16.mp4

No re-render: the 16:9 film is scaled to the full width (1080x608) over a blurred, darkened copy of itself,
and every line of data/lyrics.json becomes a caption that lights up word by word on the voice (dim before,
signal orange while it is said, bone after), for the many who watch without sound. Text stays out of the
top 250 px and the bottom 350 px, where the app's own buttons and captions sit. Long lines are split into
pages of two caption lines at most. Needs only Python 3 and an ffmpeg built with libass.
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(ROOT, "app", "public", "fonts")
W, H = 1080, 1920
SAFE_TOP, SAFE_BOTTOM = 250, 350  # kept free of text (the app's UI covers them)
# label, film and captions centred in the band the app leaves free (250..1570)
VIDEO_Y = 520  # top of the 1080x608 film
LABEL_Y = VIDEO_Y - 100  # top of the label above it
CAPTION_Y = VIDEO_Y + 608 + 62  # top of the captions under it
CAPTION_SIZE = 84
# libass finds a face by its legacy family name (name ID 1), not the typographic one: these two are
# app/public/fonts/Archivo-w1000-700.ttf and src/IBMPlexMono-Medium.ttf
CAPTION_FONT, LABEL_FONT = "Archivo SemiBold", "IBM Plex Mono Medium"
LABEL = "MOTION AS CODE"
PAGE_CHARS = 44  # a caption page: about two lines of CAPTION_SIZE in 900 px

# ASS colours are &HAABBGGRR (alpha 00 = opaque); the palette of app/src/engine/palette.ts
BONE, SIGNAL, ASH = "DFE9EE", "124DFF", "8F979C"


def ts(t):
    t = max(0.0, t)
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


# a page should not end on one of these (Italian articles, prepositions, conjunctions)
DANGLING = set("di a da in con su per tra fra il lo la i gli le un uno una e ed o che senza come non è del della dei delle al "
               "alla nel nella sul sulla dal dalla ma se".split())


def pages(words):
    """A line's words in caption pages of at most PAGE_CHARS and of even length, each ending after punctuation
    when it can, never on an article or a preposition, never between two capitalised words (After | Effects)."""
    n = len(words)
    text = lambda i, j: " ".join(w["w"] for w in words[i:j])
    total = len(text(0, n))

    def cost(i, j, target):
        s = text(i, j)
        if len(s) > PAGE_CHARS and j - i > 1:
            return None
        c = (len(s) - target) ** 2 / 8 + 25  # (25: a page more must be worth it)
        if j < n:
            last, nxt = words[j - 1]["w"], words[j]["w"]
            if last[-1] not in ",.:;?!…”":
                c += 40
                if last.lower().strip("“\"'") in DANGLING:
                    c += 60
            if last[:1].isupper() and nxt[:1].isupper():
                c += 400
        return c

    def split(k):
        """The cheapest split into k pages: (cost, pages), by dynamic programming over the word boundaries."""
        INF = float("inf")
        best = [[INF] * (n + 1) for _ in range(k + 1)]
        back = [[0] * (n + 1) for _ in range(k + 1)]
        best[0][0] = 0
        for p in range(1, k + 1):
            for j in range(p, n + 1):
                for i in range(p - 1, j):
                    c = cost(i, j, total / k)
                    if c is not None and best[p - 1][i] + c < best[p][j]:
                        best[p][j], back[p][j] = best[p - 1][i] + c, i
        cuts, j = [], n
        for p in range(k, 0, -1):
            cuts.append((back[p][j], j))
            j = back[p][j]
        return best[k][n], [words[i:j] for i, j in reversed(cuts)]

    k0 = -(-total // PAGE_CHARS)
    tries = [split(k) for k in range(k0, min(n, k0 + 1) + 1)]
    ok = [t for t in tries if t[0] < float("inf")]
    return min(ok, key=lambda t: t[0])[1] if ok else [words]


def captions(lyrics):
    pp = [p for line in lyrics["lines"] for p in pages(line["words"])]
    events = []
    for i, p in enumerate(pp):
        t0 = p[0]["start"] - 0.25
        if i:
            t0 = max(t0, pp[i - 1][-1]["end"] + 0.05)
        t1 = p[-1]["end"] + 0.8
        if i + 1 < len(pp):
            t1 = min(t1, pp[i + 1][0]["start"] - 0.25)
        t1 = max(t1, p[-1]["end"] + 0.1)
        parts = []
        for w in p:
            a, b = int((w["start"] - t0) * 1000), int((w["end"] - t0) * 1000)
            parts.append(
                f"{{\\1c&H{BONE}&\\1a&H9A&\\t({a},{a + 60},\\1c&H{SIGNAL}&\\1a&H00&)\\t({b + 80},{b + 260},\\1c&H{BONE}&)}}"
                + w["w"].replace("{", "(").replace("}", ")")
            )
        events.append(f"Dialogue: 0,{ts(t0)},{ts(t1)},Cap,,0,0,0,,{{\\fad(120,160)}}" + " ".join(parts))
    return events


def ass(lyrics, duration):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{CAPTION_FONT},{CAPTION_SIZE},&H00{BONE},&H00{BONE},&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,3,8,90,90,{CAPTION_Y},1
Style: Lab,{LABEL_FONT},34,&H30{BONE},&H30{BONE},&H00000000,&H00000000,0,0,0,0,100,100,6,0,1,0,0,8,90,90,{LABEL_Y},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    label = f"Dialogue: 0,{ts(0)},{ts(duration + 1)},Lab,,0,0,0,,{{\\1c&H{SIGNAL}&\\1a&H00&}}●{{\\1c&H{BONE}&\\1a&H30&}}  {LABEL}"
    return head + "\n".join([label] + captions(lyrics)) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", default=os.path.join(ROOT, "out", "motion-as-code_sfx.mp4"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "motion-as-code_9x16.mp4"))
    ap.add_argument("--crf", default="18")
    ap.add_argument("--keep-ass", action="store_true", help="also write the captions next to the output (.ass)")
    a = ap.parse_args()
    # (text stays in the band the app leaves free: the label from LABEL_Y, at most two caption lines under the film)
    assert LABEL_Y >= SAFE_TOP and CAPTION_Y + 2 * 1.3 * CAPTION_SIZE <= H - SAFE_BOTTOM

    lyrics = json.load(open(os.path.join(ROOT, "data", "lyrics.json"), encoding="utf-8"))
    duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video],
                                    check=True, capture_output=True, text=True).stdout)
    tmp = tempfile.mkdtemp(prefix="vertical-")
    try:
        # (only the two faces used: the Archivo instances all call themselves "Archivo", so libass gets just one)
        fonts = os.path.join(tmp, "fonts")
        os.makedirs(fonts)
        shutil.copy(os.path.join(FONTS, "Archivo-w1000-700.ttf"), fonts)
        shutil.copy(os.path.join(FONTS, "src", "IBMPlexMono-Medium.ttf"), fonts)
        sub = os.path.join(tmp, "captions.ass")
        open(sub, "w", encoding="utf-8").write(ass(lyrics, duration))
        if a.keep_ass:
            shutil.copy(sub, os.path.splitext(a.out)[0] + ".ass")
        fg_h = round(W * 9 / 16 / 2) * 2
        graph = (
            f"[0:v]split=2[a][b];"
            f"[a]scale=-2:{H},crop={W}:{H},gblur=sigma=36,colorlevels=romax=0.42:gomax=0.42:bomax=0.42,"
            # (darker under the captions, so a bright frame behind them does not wash them out)
            f"drawbox=x=0:y={VIDEO_Y + fg_h}:w={W}:h={H - VIDEO_Y - fg_h}:color=black@0.45:t=fill[bg];"
            f"[b]scale={W}:{fg_h}:flags=lanczos[fg];"
            f"[bg][fg]overlay=0:{VIDEO_Y},ass={sub}:fontsdir={fonts},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709[v]"
        )
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-stats", "-y", "-i", a.video, "-filter_complex", graph, "-map", "[v]", "-map", "0:a?",
                        "-c:v", "libx264", "-preset", "slow", "-crf", a.crf, "-pix_fmt", "yuv420p", "-c:a", "copy",
                        "-movflags", "+faststart", a.out], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"wrote {os.path.relpath(a.out, ROOT)} ({W}x{H}, {duration:.2f} s)")


if __name__ == "__main__":
    main()
