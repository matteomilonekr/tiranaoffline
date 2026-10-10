"""Sound design of `gem`: cues on the words scenes/gem.ts uses, and the music's phrases.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film gem     # -> out/gem/mix.wav
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
        (0.0, c[4] - 0.3, [(0.0, "drive"), (c[1], "groove"), (c[2], "drive"), (c[3], "groove")]),
        (c[4], W.duration - 0.05, [(c[4], "drive")]),
    ]


def cues(W, C):
    c = [cut(W, i) for i in range(len(W.lines))]
    T = lambda q, after=0.0: at(W, q, after)
    quindi, proprio = T("quindi"), T("proprio")
    shots = [0.0, c[1], proprio - 0.15, c[2], quindi - 0.12, c[3], c[4]]
    for s in shots[1:]:  # each cut: a whoosh, and the banner flapping in
        C.cue(s - 0.03, "whoosh_short", -13, 0.2)
        C.cue(s + 0.05, "pen_scratch", -18, 0.0)
    C.cue(0.0, "impact_low", -12)
    # 1: the whale swims in and bites the tag down
    C.cue(T("DeepSeek") - 0.15, "whoosh_long", -13, 0.6)
    for i, q in enumerate(["reso", "motore", "intelligenza"]):
        b = T(q)
        C.cue(b - 0.12, "whoosh_short", -15, 0.4)
        C.cue(b, "stamp", -6, 0.2)
        C.cue(b + 0.02, "impact_mid", -12, 0.2)
        C.cue(b + 0.12, "tick_soft", -12, 0.0)
        if i == 2:
            C.cue(b + 0.06, "shimmer", -10, 0.2)
            for k in range(6):
                C.cue(b + 0.1 + k * 0.07, "blip", -18, (k % 3 - 1) * 0.5)
    # 2: the repo card, GRATIS, MIT
    C.cue(c[1] + 0.05, "pop", -10)
    C.cue(T("gratis"), "stamp", -7, -0.3)
    C.cue(T("open") - 0.05, "pop", -9, 0.4)
    # 3: the engine
    C.cue(proprio - 0.15, "film_run", -12, 0.2)
    C.cue(T("addestra"), "thud", -8, 0.5)
    C.cue(T("addestra") + 0.05, "spark", -16, 0.3)
    # 4: the answer machine racing
    m = T("molte")
    C.cue(c[2] + 0.05, "pop", -11)
    for k in range(18):
        C.cue(m + 0.1 * k * (1 - k / 40), "tick_soft", -14, 0.2)
    C.cue(m, "riser", -16, 0.0)
    # 5: one coin in, a flood out
    o = T("ogni", quindi)
    C.cue(o - 0.35, "blip", -12, -0.4)
    C.cue(o + 0.08, "confirm", -10, 0.0)
    C.cue(T("costa", quindi) - 0.1, "whoosh_long", -10, 0.0)
    # 6: the price board
    for q in ["cinquanta", "quattro"]:
        t0 = T(q)
        for k in range(5):
            C.cue(t0 + k * 0.05, "tick_soft", -12, 0.3)
    q4 = T("quattro")
    C.cue(q4 + 0.2, "shimmer", -11, 0.3)
    C.cue(q4 + 0.55, "stamp", -6, 0.2)
    # 7: comment GEM
    g = T("GEM")
    C.cue(c[4] + 0.1, "shimmer", -12)
    C.typing(g - 0.05, g + 0.17, 3, -14, seed=4)
    C.cue(g + 0.3, "enter", -9, 0.4)
    C.cue(g + 0.32, "confirm", -12, 0.4)
