"""Sound design of `youtube`: cues on the words scenes/youtube.ts cuts on, and the music's phrases.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film youtube     # -> out/youtube/mix.wav
"""
import unicodedata

CUT_LEAD = 0.16
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
    g0 = max(c[11], at(W, "tirare") - 0.2)
    return [
        (0.0, c[8] - 0.2, [(0.0, "groove"), (c[2], "drive"), (c[3], "groove")]),
        (c[8] + 0.6, g0 - 0.1, [(c[8] + 0.6, "drive")]),
        (g0, W.duration - 0.05, [(g0, "light"), (c[13], "groove")]),
    ]


def cues(W, C):
    c = [cut(W, i) for i in range(len(W.lines))]
    T = lambda q, after=0.0: at(W, q, after)
    # every new shot lands with a small whoosh
    g0 = max(c[11], T("tirare") - 0.2)
    for s in c[1:8] + [c[9], c[10], g0, c[12], c[13], c[15]]:
        C.cue(s - 0.02, "whoosh_short", -16, 0.0)
    # the hook: two tiles, the link, the rows flip to Claude, the stamp
    C.cue(0.02, "pop", -12, -0.4)
    C.cue(0.17, "pop", -12, 0.4)
    C.cue(0.35, "drag", -16, 0.0)
    C.cue(0.75, "confirm", -13, 0.0)
    lav, gr = T("lavorare"), T("gratis")
    for k in range(6):
        C.cue(lav + k / 6 * max(0.5, gr - lav), "blip", -15, 0.3)
    C.cue(gr - 0.05, "stamp", -7, 0.0)
    C.cue(gr - 0.03, "thud", -10, 0.0)
    # the name: the pill, the card, "Skill", the chips
    C.cue(c[1] + 0.05, "pop", -12, 0.0)
    C.cue(T("Skill") - 0.1, "shimmer", -12, 0.0)
    for k in range(3):
        C.cue(c[1] + 0.7 + k * 0.12, "tick_soft", -13, (k - 1) * 0.4)
    # not one: the 1 struck through, then 11
    C.cue(c[2] + 0.2, "pop", -11, 0.0)
    C.cue(T("sola"), "pen_scratch", -12, 0.0)
    u = T("undici")
    C.cue(u - 0.12, "reverse_suck", -14, 0.0)
    C.cue(u - 0.08, "impact_mid", -8, 0.0)
    C.cue(u - 0.05, "bloom_hit", -12, 0.0)
    # the five skills: each command types itself into the pill
    for i, cmd in [(3, "/yt-script"), (4, "/yt-package"), (5, "/yt-edit"), (6, "/yt-comment"), (7, "/yt-plan")]:
        C.typed(cmd, c[i] + 0.02, 40, -19, -0.2, seed=i)
    v = T("ventuno")
    for k in range(8):
        C.cue(v - 0.1 + k * 0.045, "tick_soft", -14, 0.0)
    C.cue(v + 0.28, "pop", -11, 0.0)
    for k in range(5):
        C.cue(c[3] + 0.4 + k * 0.22, "pop", -15, (k - 2) * 0.25)
    for k in range(3):
        C.cue(c[4] + 0.3 + k * 0.25, "blip", -14, 0.2)
    C.cue(c[5] + 0.6, "shutter", -11, -0.2)
    C.cue(c[5] + 0.85, "shutter", -11, 0.3)
    for k in range(3):
        C.cue(c[6] + 0.3 + k * 0.35, "pop", -14, -0.3)
    for k in range(2):
        C.cue(c[6] + 0.6 + k * 0.35, "blip", -14, 0.3)
    span = max(0.6, c[8] - c[7] - 0.6)
    for k in range(10):
        C.cue(c[7] + 0.45 + k / 10 * span, "tick_soft", -14, (k % 3 - 1) * 0.3)
    # the dark turn: a drop, the planet, then VIRALITÀ
    C.cue(c[8] - 0.02, "sub_drop", -8, 0.0)
    C.cue(c[8] + 0.05, "whoosh_long", -13, 0.0)
    vi = T("viralità")
    C.cue(vi - 0.7, "riser", -16, 0.0)
    C.cue(vi - 0.12, "impact_low", -7, 0.0)
    C.cue(vi - 0.1, "glitch", -12, 0.0)
    # the niche search, the most viral, the breakdown, the ring
    C.typed("la tua nicchia", c[9] + 0.05, 28, -18, -0.2, seed=9)
    for k in range(4):
        C.cue(c[9] + 0.35 + k * 0.12, "blip", -16, 0.2)
    C.cue(T("virali"), "stamp", -10, 0.3)
    m = T("mostra")
    for k in range(3):
        C.cue(m - 0.1 + k * 0.2, "pop", -13, -0.2)
    C.cue(T("funzionato") - 0.2, "pen_line", -12, 0.0)
    # rebuilt in your voice, for your audience: the new card
    C.cue(c[10] + 0.3, "pop", -12, 0.0)
    C.cue(T("voce") - 0.15, "blip", -13, -0.4)
    p = T("pubblico", c[10])
    C.cue(p - 0.15, "blip", -13, 0.4)
    ne = max(p + 0.1, c[10] + 1.2)
    C.cue(ne, "impact_mid", -10, 0.0)
    C.cue(ne + 0.05, "shimmer", -12, 0.0)
    # no more guessing
    for k in range(6):
        C.cue(g0 + 0.1 + k * 0.08, "tick_soft", -16, (k % 2 - 0.5) * 0.8)
    ind = T("indovinare")
    C.cue(ind, "pen_scratch", -11, 0.0)
    C.cue(ind + 0.25, "confirm", -11, 0.0)
    # it writes, you upload
    C.cue(T("scrive", c[12]) - 0.2, "pop", -13, -0.4)
    ca = T("carichi")
    C.cue(ca - 0.2, "pop", -13, 0.4)
    C.cue(ca + 0.25, "mouse", -10, 0.4)
    # setup: the stopwatch runs, the three steps, done
    d = T("dieci")
    for k in range(10):
        C.cue(d - 0.3 + k / 6, "tick_soft", -15, 0.0)
    for q in ["apri", "incolli"]:
        C.cue(T(q) - 0.12, "blip", -13, 0.0)
    f = T("fatto")
    C.cue(f - 0.1, "confirm", -9, 0.2)
    C.cue(f, "spark", -12, 0.4)
    # comment YOUTUBE
    C.cue(c[15] + 0.0, "stamp", -10, -0.2)
    C.cue(c[15] + 0.15, "stamp", -11, 0.2)
    y = T("YOUTUBE", c[15])
    C.typing(y - 0.1, y + 0.3, 7, -14, seed=15)
    C.cue(y + 0.35, "enter", -10, 0.0)
    md = T("mando")
    C.cue(md - 0.1, "blip", -11, 0.3)
    C.cue(md, "shimmer", -13, 0.0)
