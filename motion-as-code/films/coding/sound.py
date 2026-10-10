"""Sound design of `coding`: cues on the words scenes/coding.ts uses, and the music's phrases.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film coding     # -> out/coding/mix.wav
"""
import unicodedata

CUT_LEAD = 0.18
MUSIC_DB = -21.0


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
        (0.0, c[8] - 0.3, [(0.0, "light"), (c[1], "groove"), (c[6], "drive")]),
        (c[8], W.duration - 0.05, [(c[8], "light"), (c[9], "groove"), (c[12], "light")]),
    ]


def cues(W, C):
    c = [cut(W, i) for i in range(len(W.lines))]
    T = lambda q, after=0.0: at(W, q, after)
    # the hook: four icons pop in, spin away; the counter runs to 100x; the creature walks in
    for i, q in enumerate(["Usa", "questi", "4", "plugin"]):
        C.cue(T(q) - 0.06, "pop", -9, (-0.3, 0.3, -0.3, 0.3)[i])
    se, molt, cento = T("se"), T("moltiplicare"), T("cento")
    C.cue(se, "whoosh_short", -13, 0.0)
    for k in range(7):
        C.cue(molt - 0.15 + (cento - molt + 0.15) * k / 7, "tick_soft", -12, 0.0)
    C.cue(cento, "impact_mid", -10, 0.0)
    v = T("vibe")
    for k in range(4):
        C.cue(v - 0.1 + k * 0.13, "blip", -18, 0.5)
    C.cue(c[1] - 0.7, "riser", -14, 0.0)
    C.cue(c[1], "bloom_hit", -10, 0.0)
    # the three numbered stars: in focus, then the name types itself in
    for i, name in [(1, "Ponytail"), (3, "OmniRoute"), (6, "Graphify")]:
        if i != 1:
            C.cue(c[i] - 0.03, "whoosh_short", -12, 0.0)
        C.cue(c[i] + 0.25, "shimmer", -13, -0.3)
        n = T(name)
        C.typing(n - 0.22, n - 0.22 + 0.045 * len(name), len(name), -17, seed=i)
    # dark cards developing out of their placeholders
    dev = [T("che", c[1]), c[2], T("che", c[3]), T("un", T("che", c[3])), T("appena") - 0.14, c[5], T("che", c[6]), c[7], c[11]]
    for d in dev:
        C.cue(d, "whoosh_short", -15, 0.0)
        C.cue(d + 0.55, "confirm", -19, 0.2)
    # 1: the terminal types; the bars grow
    C.typed("aggiungi l'export CSV agli ordini", T("che", c[1]) + 0.3, 75, -17, -0.2, seed=3)
    for k in range(4):
        C.cue(c[2] + 0.35 + k * 0.12, "blip", -14, -0.4 + k * 0.27)
    C.cue(T("senza", c[2]), "pop", -14, 0.0)
    # 2: the loop, the providers grid, the carousel, the limit running out, the counter
    C.cue(T("che", c[3]) + 0.2, "shimmer", -15, 0.0)
    g0 = T("un", T("che", c[3]))
    for k in range(9):
        C.cue(g0 + 0.35 + k * 0.06, "tick_soft", -17, (k % 6 - 2.5) * 0.15)
    for k in range(int((T("appena") - c[4]) / 0.42) + 1):
        C.cue(c[4] + k * 0.42, "drag", -18, 0.0)
        C.cue(c[4] + k * 0.42 + 0.2, "tick_soft", -15, 0.0)
    ap = T("appena") - 0.14
    for k in range(3):
        C.cue(ap + 0.05 + k * 0.35, "tick_soft", -13, 0.3)
    li = T("limiti")
    C.cue(li, "glitch", -13, 0.0)
    C.cue(li + 0.2, "pop", -10, 0.0)
    for k in range(8):
        C.cue(c[5] + 0.25 + k * 0.1, "tick_soft", -14, 0.0)
    C.cue(c[5] + 1.05, "shimmer", -12, 0.0)
    # 3: the graph comes up; the query walks it
    C.cue(T("che", c[6]) + 0.25, "shimmer", -12, 0.0)
    C.typed("graphify query", c[7] + 0.25, 60, -17, -0.3, seed=5)
    for k in range(5):
        C.cue(c[7] + 0.35 + k * 0.22, "blip", -15, 0.2 + k * 0.1)
    # 4: the talking heads, the table, the repo, the six stages
    for i in (8, 10, 12):
        C.cue(c[i] - 0.03, "whoosh_short", -14, 0.0)
    C.cue(T("Agent"), "pop", -12, 0.0)
    C.cue(c[9] - 0.03, "whoosh_short", -13, 0.0)
    for k in range(10):
        C.cue(c[9] + 0.1 + k * 0.12, "tick_soft", -15, -0.3 + k * 0.06)
    f = T("firmato")
    C.cue(f - 0.12, "pop", -10, 0.0)
    cm = T("centomila")
    for k in range(10):
        C.cue(cm - 0.2 + k * 0.09, "tick_soft", -14, 0.3)
    C.cue(cm + 0.75, "shimmer", -12, 0.3)
    C.cue(T("senior"), "pop", -12, 0.0)
    for q, after in [("fase", 0.0), ("pianificazione", 0.0), ("codice", T("pianificazione")), ("test", T("pianificazione"))]:
        C.cue(T(q, after) - 0.05, "blip", -13, 0.0)
    C.cue(T("e", T("test", T("pianificazione"))), "blip", -12, 0.0)
    cod = T("CODING", c[12])
    C.cue(cod - 0.05, "pop", -9, 0.0)
    C.typing(cod - 0.05, cod + 0.35, 6, -15, seed=9)
    C.cue(T("link"), "shimmer", -11, 0.0)
