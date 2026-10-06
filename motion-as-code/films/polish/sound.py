"""Sound design of `polish`: cues on the words scenes/polish.ts uses, and the music's phrases.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film polish     # -> out/polish/mix.wav
"""
import unicodedata

CUT_LEAD = 0.18
MUSIC_DB = -20.0


def key(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn" and ch.isalnum()).lower()


def at(W, q, after=0.0, end=False):
    k = key(q)
    for l in W.lines:
        for w in l["words"]:
            if key(w["w"]) == k and w["start"] >= after - 1e-6:
                return w["end"] if end else w["start"]
    raise SystemExit(f"word not found: {q!r} after {after:.2f}")


def cut(W, i):
    l, p = W.lines[i], W.lines[i - 1] if i > 0 else None
    s = l["words"][0]["start"]
    return max(s - CUT_LEAD, min(p["end"] + 0.02, s - 0.02) if p else 0)


def phrases(W):
    c = [cut(W, i) for i in range(len(W.lines))]
    return [
        (0.0, c[5] - 0.3, [(0.0, "groove"), (c[1], "light"), (c[2], "groove"), (c[3], "drive"), (c[4], "groove")]),
        (c[5], W.duration - 0.05, [(c[5], "drive")]),
    ]


def cues(W, C):
    c = [cut(W, i) for i in range(len(W.lines))]
    T = lambda q, after=0.0: at(W, q, after)
    shots = [0.0, c[1], T("gradienti") - 0.25, c[2], c[3], T("spaziature") - 0.3, c[4], c[5]]
    for s in shots[1:]:
        C.cue(s - 0.03, "whoosh_short", -13, 0.2)
        C.cue(s + 0.05, "pen_scratch", -18, 0.0)
    # 1: stamped and zapped
    s = T("secondo")
    C.cue(s - 0.25, "whoosh_short", -14, 0.0)
    C.cue(s, "stamp", -5, 0.0)
    C.cue(s + 0.01, "impact_mid", -10, 0.0)
    z = T("indizio")
    C.cue(z, "glitch", -9, 0.2)
    C.cue(z + 0.05, "spark", -11, -0.2)
    C.cue(z + 0.3, "glitch", -13, 0.3)
    # 2: the template press, five times
    start = min(T("template") - 0.2, c[1] + 0.3)
    for k in range(5):
        C.cue(start + k * 0.5 + 0.15, "thud", -9, (k - 2) * 0.2)
        C.cue(start + k * 0.5 + 0.16, "stamp", -14, (k - 2) * 0.2)
    # 3: the factory belt
    C.cue(shots[2], "film_run", -12, 0.0)
    r = T("riquadri")
    for k in range(3):
        C.cue(r + k * 0.12, "blip", -13, 0.3)
    # 4: the skill lands, the stars roll
    sk = T("skill")
    C.cue(sk - 0.2, "drag", -12, 0.0)
    C.cue(sk + 0.4, "thud", -7, 0.0)
    C.cue(sk + 0.42, "shimmer", -9, 0.0)
    st = T("settantacinquemila")
    C.cue(st - 0.3, "pop", -10, 0.0)
    for k in range(10):
        C.cue(st + k * 0.09, "tick_soft", -14, 0.3)
    C.cue(st + 1.0, "shimmer", -12, 0.3)
    # 5: the command typed, Enter
    cm = T("comando")
    C.typed("ridisegna la mia homepage", cm + 0.1, 26, -16, -0.1, seed=7)
    C.cue(T("ridisegna"), "enter", -8, 0.4)
    # 6: the canvas turns over; guides, colours, type
    C.cue(shots[5] + 0.1, "whoosh_short", -11, 0.0)
    C.cue(shots[5] + 0.32, "confirm", -12, 0.0)
    C.cue(T("spaziature"), "pen_line", -12, -0.2)
    C.cue(T("colori"), "pop", -9, 0.4)
    C.cue(T("font"), "pop", -9, -0.4)
    # 7: the wall turning over, the counter falling to 0
    a, b = T("corregge") - 0.1, T("veda")
    for k in range(15):
        C.cue(a + (b - a) * k / 14, "tick_soft", -12, (k % 5 - 2) * 0.25)
    C.cue(b + 0.3, "confirm", -10, 0.0)
    # 8: GRATIS, comment POLISH
    g = T("gratis")
    C.cue(g - 0.1, "pop", -8, 0.0)
    C.cue(g, "pen_scratch", -13, 0.4)
    p = T("POLISH")
    C.typing(p - 0.05, p + 0.38, 6, -14, seed=9)
    C.cue(p + 0.5, "enter", -9, 0.4)
    C.cue(p + 0.52, "shimmer", -12, 0.4)
