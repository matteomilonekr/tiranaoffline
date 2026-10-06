"""Sound design: the cue sheet and the mix -> out/mix.wav (voice + effects + music bed, -14 LUFS).

    uv run --no-project --with numpy python analysis/sfx_mix.py            # --no-music: voice and effects only

Every cue is placed by the same word timings the plates use (data/lyrics.json): find a line or a word
by content, then an offset. To move an effect, change its time expression; to make it louder or
quieter, change its dB. The music bed (music.py) is arranged on the same moments (anchors()).

The chain: the voice is high-passed at 80 Hz and gently compressed (3:1 above -20 dB); effects and music
share one reverb room and are ducked under the voice (effects up to DUCK_DB, music up to MUSIC_DUCK_DB);
the whole mix is normalised to TARGET_LUFS (ITU-R BS.1770 integrated loudness, what Instagram and YouTube
normalise to) with true peaks under TRUE_PEAK_DB (4x oversampled).

No re-render is needed after a change: rebuild the mix, then copy the picture and add the audio:
    cd out
    ffmpeg -i motion-as-code.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest motion-as-code_sfx.mp4
"""
import argparse
import json
import os
import subprocess
import unicodedata
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 48000
DUCK_DB = 7.0
MUSIC_DUCK_DB = 9.0
MUSIC_DB = -21.5  # the bed's level (about 14 LU under the voice, before ducking)
SFX_SEND, ROOM_DB = 0.15, -6.0  # how much of the effects goes to the shared room, and the room's level
TARGET_LUFS = -14.0
TRUE_PEAK_DB = -1.5
CUT_LEAD = 0.18  # as in timeline.ts
HOLD = 0.4  # as in verdict.ts


# ------------------------------------------------------------------ lookups (same rules as _vo.ts)
def fold(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower().replace("’", "'").replace("‘", "'")
    s = "".join(ch if (ch.isalnum() or ch in "' ") else " " for ch in s)
    return " ".join(s.split())


class Words:
    def __init__(self, ly, au):
        self.lines = ly["lines"]
        self.au = au
        self.duration = au["duration"]

    def line(self, q, nth=0):
        k = fold(q)
        hits = [l for l in self.lines if k in fold(l["text"])]
        if len(hits) <= nth:
            raise SystemExit(f"line not found: {q!r}")
        return hits[nth]

    def phrase(self, q, line=None, nth=0):
        want = fold(q).split()
        pool = (self.line(line)["words"] if isinstance(line, str) else line["words"]) if line else [w for l in self.lines for w in l["words"]]
        hits = []
        for i in range(len(pool) - len(want) + 1):
            if all(fold(pool[i + j]["w"]) == want[j] for j in range(len(want))):
                hits.append(pool[i:i + len(want)])
        if len(hits) <= nth:
            raise SystemExit(f"words not found: {q!r}")
        return hits[nth]

    def word(self, q, line=None, nth=0):
        return self.phrase(q, line, nth)[0]

    def cut(self, q):
        l = self.line(q)
        i = self.lines.index(l)
        prev = self.lines[i - 1] if i > 0 else None
        s = l["words"][0]["start"]
        return max(s - CUT_LEAD, min(prev["end"] + 0.02, s - 0.02) if prev else 0)


# ------------------------------------------------------------------ the shared moments
def anchors(W):
    """What the effects and the music both hit: the plates' cuts (as timeline.ts) and the moments the plates
    time from the words (prompt.ts's enter key, verdict.ts's slam, implosion and return home)."""
    b = {k: W.cut(q) for k, q in [
        ("model", "Questo è Claude Code"), ("prompt", "Per esempio"), ("crazy", "Ed è qui che diventa folle"),
        ("code", "Scrive l’animazione stessa"), ("frames", "Poi viene renderizzata"), ("pipeline", "Il vecchio flusso"),
        ("edits", "E siccome è tutto procedurale"), ("verdict", "Quindi: sostituisce After Effects")]}
    L5 = W.line("Crea una sequenza")
    paz = W.word("pazzesco", W.line("farlo partendo"))
    t_imp = min(W.duration - 0.9, max(paz["end"], paz["start"] + 0.35) + HOLD)
    return dict(
        b=b,
        t_enter=min(max(max(L5["end"] + 0.18, b["crazy"] - 0.5), L5["end"] + 0.05), b["crazy"] - 0.2),
        t_slam=paz["start"], t_imp=t_imp, t_home=min(W.duration - 0.35, t_imp + 0.45),
        new_row=W.line("Il nuovo")["words"][0]["start"], first_cmd=W.line("Rallenta la transizione")["words"][0]["start"],
    )


# ------------------------------------------------------------------ the cue sheet
def cue_sheet(W):
    """(time s, effect, gain dB, pan -1..1) for the whole video."""
    C = []

    def cue(t, name, db, pan=0.0):
        C.append((float(t), name, float(db), float(pan)))

    keys = ["key_1", "key_2", "key_3", "key_4"]

    def typing(t0, t1, n, db, pan=0.0, seed=0):
        """n key strokes spread over [t0, t1] with a little human jitter."""
        r = np.random.default_rng(seed)
        for i in range(max(0, n)):
            u = (i + 0.5) / max(1, n)
            cue(t0 + (t1 - t0) * u + r.uniform(-0.012, 0.012), keys[(i + seed) % 4], db + r.uniform(-2.5, 1), pan)

    def ticks(words, db, pan=0.0):
        for w in words:
            cue(w["start"], "tick_soft", db, pan)

    A = anchors(W)
    b = A["b"]

    # ---------------------------------------------------------------- hook
    L0, L1 = W.line("E se ti dicessi"), W.line("non è un MCP")
    motion, graphics = W.phrase("motion graphics", L0)
    questa = W.word("questa", L0)
    after, effects = W.phrase("After Effects", L0)
    no = W.phrase("E no", L1)[1]
    cue(0.02, "spark", -30)
    ticks(L0["words"][: L0["words"].index(motion)], -26, -0.2)
    cue(motion["start"] - 0.05, "whoosh_short", -12)
    cue(motion["start"], "impact_mid", -8)
    cue(graphics["start"], "impact_low", -12)
    cue(motion["start"], "pen_line", -20, -0.3)
    cue(motion["start"] + 0.3, "pen_line", -22, 0.3)
    for w in (motion, graphics):
        n = 6 if w is motion else 8
        for i in range(n):
            cue(w["start"] + (max(0.2, w["end"] - w["start"])) * i / n, "tick_soft", -30, -0.5 + i / n)
    cue(graphics["start"] + 0.12, "pen_scratch", -22, 0.2)
    cue(questa["start"] + 0.02, "pen_scratch", -18, -0.3)
    cue(questa["start"] + 0.24, "pen_line", -18, 0.2)
    cue(questa["start"] + 0.5, "pop", -20, 0.3)
    tS = effects["start"] + 0.16
    cue(tS, "pen_line", -14, 0.1)
    cue(tS + 0.2, "stamp", -15, 0.2)
    cue(effects["start"] + 0.36, "spark", -20, 0.3)
    tD = L0["end"] + 0.05
    cue(tD, "whoosh_long", -14)
    cue(tD, "pen_line", -20, -0.4)
    cue(tD + 0.36, "pen_line", -20, 0.4)
    cue(tD + 0.72, "pen_scratch", -20)
    cue(tD + 0.86, "pop", -22)
    cue(no["start"], "stamp", -10)
    cue(no["start"] + 0.13, "stamp", -12)
    cue(no["start"] + 0.02, "spark", -14)
    cue(b["model"] - 0.4, "whoosh_long", -12, 0.3)

    # ---------------------------------------------------------------- model
    T0 = b["model"]
    L2, L3 = W.line("Questo è Claude Code"), W.line("Invece di controllare")
    claude, code = W.phrase("Claude Code", L2)
    invece = L3["words"][0]
    controllare = W.word("controllare", L3)
    eff2 = W.phrase("After Effects", L3)[1]
    gli = W.word("gli", L3)
    cue(T0 + 0.25, "thud", -16)
    cue(T0 + 0.05, "pen_line", -20, 0.2)
    typing(L2["words"][0]["start"] + 0.35, L2["words"][0]["start"] + 0.6, 8, -20, 0.3, 3)
    cue(claude["start"], "impact_mid", -13)
    cue(invece["start"], "whoosh_long", -16, -0.3)
    for i in range(9):
        cue(controllare["start"] + (eff2["end"] - 0.1 - controllare["start"]) * i / 8, "mouse", -14, -0.5)
    cue(eff2["start"] + 0.12, "pen_line", -14, -0.4)
    cue(eff2["start"] + 0.3, "stamp", -18, -0.4)
    cue(gli["start"], "whoosh_short", -16)
    typed = L3["words"][L3["words"].index(gli):]
    for i, w in enumerate(typed):
        n = len(w["w"])
        typing(w["start"], max(w["start"] + 0.05, w["end"]), n, -21, 0.2, 10 + i)

    # ---------------------------------------------------------------- prompt
    T0, T1 = b["prompt"], b["crazy"]
    L5 = W.line("Crea una sequenza")
    cue(T0 + 0.02, "shimmer", -24)
    pops = {"crea", "sequenza", "cinematografica", "quindici", "secondi", "tipografia", "cinetica", "transizioni", "fluide", "forme", "elementi", "3d", "movimenti", "camera", "continui"}
    for i, w in enumerate(L5["words"]):
        cue(w["start"], keys[i % 4], -14, -0.3 + 0.6 * i / len(L5["words"]))
        if fold(w["w"]) in pops:
            cue(w["start"] - 0.14, "blip", -24, 0.3)
            cue(w["start"], "tick_soft", -24, 0.3)
    t_enter = A["t_enter"]
    cue(T1 - 1.3, "riser", -14)
    cue(t_enter, "enter", -10, 0.5)
    cue(t_enter + 0.05, "whoosh_long", -12)

    # ---------------------------------------------------------------- crazy
    T0, T1 = b["crazy"], b["code"]
    L6, L7 = W.line("Ed è qui che diventa folle"), W.line("non genera direttamente")
    folle = L6["words"][-1]
    cue(T0, "impact_low", -12)
    for i, w in enumerate(L6["words"][:-1]):
        cue(w["start"], "thud", -15, -0.4 + 0.2 * i)
    cue(folle["start"], "impact_low", -11)
    cue(folle["start"] + 0.12, "glitch", -18)
    cue(folle["start"] + 0.35, "glitch", -16)
    cue(folle["start"], "spark", -14)
    non = L7["words"][0]
    cue(non["start"] - 0.25, "whoosh_short", -14)
    cue(non["start"] - 0.25, "pen_line", -20)
    dirett = W.word("direttamente", L7)
    cue(dirett["start"] + 0.05, "stamp", -12, -0.2)
    cue(dirett["start"] + 0.24, "stamp", -14, 0.2)
    cue(dirett["start"] + 0.06, "spark", -16)
    mp4 = W.word("MP4", L7)
    cue(mp4["start"] + 0.1, "glitch", -14)
    cue(T1 - 0.2, "whoosh_short", -16)

    # ---------------------------------------------------------------- code
    T0, T1 = b["code"], b["frames"]
    L8, L9 = W.line("Scrive l’animazione"), W.line("Ogni forma")
    s0 = L8["words"][0]["start"]
    forma, parola = W.word("forma", L9), W.word("parola", L9)
    mov = W.word("movimento", L9)
    defin, mat = W.word("definito", L9), W.word("matematicamente", L9)
    codice = W.word("codice", L8)
    # the code lines as code.ts types them: (text, start, chars per second, live value once typed); a key every other char
    code_lines = [
        ("// scenes/scena.ts — generato da Claude", T0 + 0.1, 90, False),
        ("import { Scene, type Frame } from '../engine/scene';", s0, 110, False),
        ("export default class Scena extends Scene {", s0 + 0.55, 80, False),
        ("  render(f: Frame) {", codice["start"], 60, False),
        ("    const r = 120 + 60 * Math.sin(f.lt * 2.0);  // forma", forma["start"], 70, True),
        ("    const parola = 'codice'.slice(0, f.lt * 8);  // parola", parola["start"], 70, True),
        ("    cam.zoom = 1 + 0.4 * ease.inOutCubic(f.p);  // camera", mov["start"], 70, True),
        ("    disegna(cerchio(960, 540, r), testo(parola), cam);", mov["start"] + 0.9, 80, False),
        ("  }", mov["start"] + 1.5, 40, False),
        ("}", mov["start"] + 1.55, 40, False),
    ]
    for i, (text, t0, cps, live) in enumerate(code_lines):
        t1 = t0 + len(text) / cps
        typing(t0 + (len(text) - len(text.lstrip())) / cps, t1, max(1, len(text.strip()) // 2), -24, -0.5, 30 + i)
        if live:
            cue(t1 + 0.2, "pop", -17, 0.5)
    cue(mov["start"], "whoosh_short", -18, 0.5)
    cue(defin["start"], "whoosh_long", -16)
    cue(defin["start"], "shimmer", -20)
    cue(mat["start"], "tick_soft", -18)
    cue(defin["start"] - 0.1, "spark", -24)

    # ---------------------------------------------------------------- frames
    T0, T1 = b["frames"], b["pipeline"]
    L10 = W.line("Poi viene renderizzata")
    f1, f2 = W.phrase("fotogramma per fotogramma", L10)[0], W.phrase("fotogramma per fotogramma", L10)[2]
    tras, video = W.word("trasformata", L10), W.word("video", L10)
    syl = [t for t, _ in W.au["onsets"].get("syllable", []) if f1["start"] - 0.02 <= t <= f2["end"]]
    steps = syl if len(syl) >= 4 else list(np.linspace(f1["start"], f2["end"] - 0.1, 8))
    cue(T0, "whoosh_short", -16, 0.5)
    for i, t in enumerate(steps):
        cue(t, "shutter", -12, -0.2 + 0.4 * ((i % 2) - 0.5))
    cue(tras["start"], "film_run", -14)
    t_fold = tras["start"] + (video["start"] - tras["start"]) * 0.65
    t_done = video["start"] + 0.25
    cue(t_fold, "whoosh_long", -14)
    cue(t_done, "thud", -14)
    cue(t_done + 0.12, "confirm", -12)

    # ---------------------------------------------------------------- pipeline
    T0, T1 = b["pipeline"], b["edits"]
    L11, L12 = W.line("Il vecchio flusso"), W.line("Il nuovo")
    olds = [W.word("After", L11), W.word("livelli", L11), W.word("keyframe", L11), W.word("curve", L11)]
    news = [W.word(q, L12) for q in ("prompt", "codice", "render", "video")]
    cue(T0, "shimmer", -22)
    for i, w in enumerate(olds):
        cue(w["start"] - 0.05, "thud", -16, -0.6 + 0.4 * i)
        cue(w["start"] + 0.25, "pen_scratch", -24, -0.6 + 0.4 * i)
    cue(L12["words"][0]["start"], "whoosh_short", -16)
    for i, w in enumerate(news):
        cue(w["start"] - 0.04, "pen_line", -16, -0.6 + 0.4 * i)
        cue(w["start"], "pop", -16, -0.6 + 0.4 * i)
        if i < 3:
            cue(w["start"] + 0.3, "pen_scratch", -20, -0.4 + 0.4 * i)
    cue(news[-1]["end"] + 0.1, "tick_soft", -20)

    # ---------------------------------------------------------------- edits
    T0, T1 = b["edits"], b["verdict"]
    cue(T0 + 0.1, "pop", -20)
    L13 = W.line("tutto procedurale")
    ticks(L13["words"], -28, 0.2)
    cue(W.word("frase", L13)["start"], "shimmer", -24)
    cmds = [W.line(q) for q in ("Rallenta la transizione", "Cambia il colore", "Aggiungi una scena", "Renderizza di nuovo")]
    for i, cm in enumerate(cmds):
        for j, w in enumerate(cm["words"]):
            typing(w["start"], max(w["start"] + 0.05, w["end"]), len(w["w"]), -20, -0.5, 50 + 10 * i + j)
        cue(cm["end"], "enter", -14, -0.5)
        cue(cm["end"] + 0.12, "blip", -20, -0.3)
        cue(cm["end"] + 0.3, "blip", -22, -0.3)
    t_slow, t_blue, t_scene, t_render = (cm["end"] for cm in cmds)
    cue(t_slow, "whoosh_short", -22, 0.5)
    cue(t_blue, "shimmer", -16, 0.5)
    cue(t_scene + 0.05, "pop", -14, 0.5)
    cue(t_scene + 0.1, "thud", -18, 0.5)
    cue(t_render + 0.1, "film_run", -20, 0.5)
    cue(t_render + 1.1, "confirm", -12, 0.5)
    L18 = W.line("Quattro comandi")
    quattro = L18["words"][0]
    for i in range(4):
        cue(quattro["start"] + i * 0.12, "pop", -12, -0.6)
    cent = W.word("centinaia", L18)
    for i in range(40):
        cue(cent["start"] + 0.9 * i / 40, "tick_soft", -28, -0.3 + 0.8 * (i % 7) / 7)
    sposta = W.word("spostare", L18)
    cue(sposta["start"], "mouse", -16, 0.3)
    cue(sposta["start"] + 0.1, "drag", -14, 0.3)

    # ---------------------------------------------------------------- verdict
    T0 = b["verdict"]
    L19, L20, L21 = W.line("sostituisce After Effects"), W.line("Non proprio"), W.line("farlo partendo")
    t_slam, t_imp, t_home = A["t_slam"], A["t_imp"], A["t_home"]
    cue(T0 + 0.02, "pen_line", -20)
    cue(L19["words"][0]["start"], "pop", -22)
    ticks(L19["words"][1:], -24)
    nonw = L20["words"][0]
    cue(nonw["start"], "stamp", -10, 0.2)
    cue(nonw["start"] + 0.02, "pen_scratch", -16, 0.2)
    cue(L20["end"] - 0.05, "pen_line", -18, 0.3)
    ticks(L21["words"][:-2], -26)
    cue(t_slam - 1.3, "riser", -14)
    cue(t_slam, "impact_mid", -9)
    cue(t_slam, "impact_low", -10)
    cue(t_imp - 0.3, "reverse_suck", -12)
    cue(t_imp, "sub_drop", -13)
    cue(t_imp + 0.36, "bloom_hit", -9)
    cue(t_imp + 0.36, "spark", -14)
    cue(t_home, "shimmer", -26)
    return sorted(C)


# ------------------------------------------------------------------ audio io
def load_audio(path, sr=SR, channels=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).astype(np.float64)


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ filters
def biquad(x, b, a):
    """A biquad (coefficients at SR) applied as its exact frequency response on a padded FFT."""
    n = len(x) + SR
    z = np.exp(-2j * np.pi * np.fft.rfftfreq(n, 1 / SR) / SR)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return np.fft.irfft(np.fft.rfft(x, n=n, axis=0) * h[:, None], n=n, axis=0)[: len(x)]


def highpass(x, f0, q=0.7071):
    """Second-order high-pass (RBJ cookbook)."""
    w = 2 * np.pi * f0 / SR
    al, cw = np.sin(w) / (2 * q), np.cos(w)
    b, a = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], [1 + al, -2 * cw, 1 - al]
    return biquad(x, [v / a[0] for v in b], [v / a[0] for v in a])


def compress(x, thr_db=-20.0, ratio=3.0, attack=0.005, release=0.08):
    """Feed-forward compression on the RMS level (10 ms): above thr_db, ratio:1. Gentle on a voice's peaks."""
    hop = int(0.001 * SR)
    m = -(-len(x) // hop)
    pw = np.concatenate([(x ** 2).mean(axis=1), np.zeros(m * hop - len(x))]).reshape(m, hop).mean(axis=1)
    c = np.cumsum(np.concatenate([np.zeros(10), pw]))
    want = np.maximum(0, 10 * np.log10((c[10:] - c[:-10]) / 10 + 1e-12) - thr_db) * (1 - 1 / ratio)
    ka, kr = 1 - np.exp(-1 / (attack * 1000)), 1 - np.exp(-1 / (release * 1000))  # per 1 ms
    g = np.empty(m)
    cur = 0.0
    for i, w in enumerate(want.tolist()):
        cur += (ka if w > cur else kr) * (w - cur)
        g[i] = cur
    return x * 10 ** (-np.repeat(g, hop)[: len(x)] / 20)[:, None]


# ------------------------------------------------------------------ loudness and true peak (ITU-R BS.1770-4)
def k_weight(x):
    """K-weighting: the two BS.1770 biquads at 48 kHz."""
    y = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    return biquad(y, [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621])


def integrated_lufs(x):
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(y[i:i + blk] ** 2, axis=0).sum() for i in range(0, len(y) - blk, hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-0.691 + 10 * np.log10(ms + 1e-12) > rel]
    return -0.691 + 10 * np.log10(ms.mean())


def true_peaks(x, factor=4, taps=48):
    """Per sample, the largest of its factor-x oversampled neighbours over both channels (the true peak of
    BS.1770 annex 2: the peaks a decoder can make between the samples). Polyphase windowed-sinc interpolation."""
    L = taps * factor
    h = np.sinc((np.arange(L) - (L - 1) / 2) / factor) * np.kaiser(L, 8.0)
    pk = np.abs(x).max(axis=1)
    d = taps // 2
    for p in range(factor):
        hp = h[p::factor]
        hp = hp / hp.sum()
        for ch in range(x.shape[1]):
            y = np.abs(np.convolve(x[:, ch], hp))[d:d + len(x)]
            pk = np.maximum(pk, np.concatenate([y, np.zeros(len(x) - len(y))]))
    return pk


def limit(x, ceil_db=TRUE_PEAK_DB, attack=0.005, release=0.08):
    """True-peak limiter: the gain each sample needs, looked ahead over `attack` (so it is down before the peak),
    released exponentially, then ramped (moving average over `attack`) so it never steps."""
    from numpy.lib.stride_tricks import sliding_window_view
    n, win = len(x), max(1, int(attack * SR))
    need = np.minimum(1.0, 10 ** (ceil_db / 20) / np.maximum(true_peaks(x), 1e-9))
    ahead = sliding_window_view(np.concatenate([need, np.ones(win - 1)]), win).min(axis=1)
    rel = float(np.exp(-1 / (release * SR)))
    env = np.empty(n)
    cur = 1.0
    for i, g in enumerate(ahead.tolist()):
        cur = g if g < cur else g + (cur - g) * rel
        env[i] = cur
    # (the average over the window before each sample is at most the gain its peak needs)
    c = np.concatenate([[0.0], np.cumsum(np.concatenate([np.ones(win - 1), env]))])
    ramp = (c[win:] - c[:-win]) / win
    return x * ramp[:, None]


def voice_envelope(voice):
    """0..1 per sample: how much the voice is speaking (10 ms RMS against its loudest, fast attack ~20 ms,
    slow release ~330 ms), what the ducking follows."""
    n, hop = len(voice), int(0.01 * SR)
    m = n // hop
    v = np.sqrt((voice[: m * hop, 0].reshape(m, hop) ** 2).mean(axis=1) + 1e-12)
    vdb = 20 * np.log10(v)
    act = np.clip((vdb - (vdb.max() - 45)) / 20, 0, 1)
    env = np.zeros(m)
    e = 0.0
    for k in range(m):
        c = 0.5 if act[k] > e else 0.03
        e += c * (act[k] - e)
        env[k] = e
    return np.concatenate([np.repeat(env, hop), np.full(n - m * hop, env[-1] if m else 0.0)])


# ------------------------------------------------------------------ mix
def main():
    import music

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voice", default=os.path.join(ROOT, "audio", "voiceover.mp3"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "mix.wav"))
    ap.add_argument("--list", action="store_true", help="print the cue sheet")
    ap.add_argument("--no-music", action="store_true", help="voice and effects only")
    ap.add_argument("--stems", metavar="DIR", help="also write voice.wav, effects.wav and music.wav (mix gain, before the limiter)")
    a = ap.parse_args()

    ly = json.load(open(os.path.join(ROOT, "data", "lyrics.json"), encoding="utf-8"))
    au = json.load(open(os.path.join(ROOT, "data", "audio.json"), encoding="utf-8"))
    W = Words(ly, au)
    cues = cue_sheet(W)
    if a.list:
        for t, name, db, pan in cues:
            print(f"{t:8.3f}  {name:13s} {db:+5.1f} dB  pan {pan:+.2f}")

    # the voice: no rumble under 80 Hz, peaks a little tamed
    raw = load_audio(a.voice)
    voice = compress(highpass(raw, 80.0))
    n = len(voice)
    sfx_dir = os.path.join(ROOT, "audio", "sfx")
    bank = {}
    bus = np.zeros((n + 3 * SR, 2))
    for t, name, db, pan in cues:
        if name not in bank:
            bank[name] = load_audio(os.path.join(sfx_dir, f"{name}.wav"))
        s = bank[name]
        i = int(round(t * SR))
        if i < 0 or i >= n:
            continue
        g = 10 ** (db / 20)
        th = (pan + 1) * np.pi / 4  # constant-power pan
        gl, gr = np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)
        bus[i:i + len(s), 0] += s[:, 0] * g * gl
        bus[i:i + len(s), 1] += s[:, 1] * g * gr
    bus = bus[:n]

    # the music bed and the room it shares with the effects
    if a.no_music:
        bed, send = np.zeros_like(bus), np.zeros_like(bus)
    else:
        bed, send = music.bed(anchors(W), n)
        bed, send = bed * 10 ** (MUSIC_DB / 20), send * 10 ** (MUSIC_DB / 20)
    verb = music.room(bus * SFX_SEND + send) * 10 ** (ROOM_DB / 20)

    # ducking: the voice's envelope pulls effects and music down under it
    env = voice_envelope(voice)
    duck_fx, duck_mu = 10 ** (-DUCK_DB * env / 20)[:, None], 10 ** (-MUSIC_DUCK_DB * env / 20)[:, None]
    fx, mu = (bus + verb) * duck_fx, bed * duck_mu
    mix = voice + fx + mu
    lv = integrated_lufs(voice)
    print(f"voice {lv:.1f} LUFS · effects {integrated_lufs(fx) - lv:+.1f} LU" + ("" if a.no_music else f" · music {integrated_lufs(mu) - lv:+.1f} LU") + " (ducked, against the voice)")

    # to the target loudness; the limiter takes off a little, so a second pass makes up for it
    gain = 1.0
    for _ in range(2):
        out = limit(mix * gain)
        gain *= 10 ** ((TARGET_LUFS - integrated_lufs(out)) / 20)
    out = limit(mix * gain)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    write_wav(a.out, out)
    if a.stems:
        os.makedirs(a.stems, exist_ok=True)
        for name, x in (("voice", voice), ("effects", fx), ("music", mu)):
            write_wav(os.path.join(a.stems, f"{name}.wav"), x * gain)
    print(f"{len(cues)} cues, {len(bank)} effects{'' if a.no_music else ', music bed'} · mix {integrated_lufs(out):.1f} LUFS, "
          f"true peak {20 * np.log10(true_peaks(out).max()):.1f} dBTP · wrote {os.path.relpath(a.out, ROOT)}")


if __name__ == "__main__":
    main()
