"""Sound design of `grill`: cues on the words scenes/grill.ts cuts on, and the music's phrases.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film grill     # -> out/grill/mix.wav
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
    return [
        (0.0, c[12] - 0.3, [(0.0, "groove"), (c[2], "light"), (c[5], "groove"), (c[8], "drive")]),
        (c[12], W.duration - 0.05, [(c[12], "groove"), (c[18], "light")]),
    ]


def cues(W, C):
    c = [cut(W, i) for i in range(len(W.lines))]
    T = lambda q, after=0.0: at(W, q, after)
    # every new stage above the seam lands with a small whoosh
    shots = [T("stelle") - 0.1, c[1], T("che", c[1]) - 0.15, c[2], c[3], T("stupida") - 0.35, c[4], T("spiegato") - 0.15,
             c[5], T("grill-me", c[5]) - 0.4, c[6], T("domanda") - 0.3, c[7], c[8], c[9], T("ciclo") - 0.15, c[10],
             T("analizza") - 0.2, T("report") - 0.3, c[12], c[13], c[14], T("aggiorna") - 0.25, c[15], c[16],
             T("mattpocock/skills", c[16]) + 0.3, c[17], T("volta") - 0.25, T("pronto") - 0.2, c[18]]
    for s in shots:
        C.cue(s - 0.02, "whoosh_short", -16, 0.0)
    # the stars counter runs up, then the buckets fill
    n = T("280.000")
    for k in range(12):
        C.cue(0.1 + (n - 0.1) * k / 12, "tick_soft", -15, 0.0)
    C.cue(n + 0.05, "impact_mid", -11, 0.0)
    C.cue(n + 0.8, "pop", -11, 0.4)
    st = T("stelle")
    for k in range(6):
        C.cue(st + k * 0.12, "blip", -18, (k % 3 - 1) * 0.4)
    # the best feature; the interrogation
    C.cue(c[1] + 0.1, "shimmer", -12, 0.0)
    C.cue(c[1] + 0.5, "pop", -12, 0.3)
    q = T("che", c[1]) - 0.15
    for k, d in enumerate([0.25, 0.55, 0.85, 1.1]):
        C.cue(q + d, "pop", -13, (k % 2 - 0.5) * 0.6)
    # the court, the wrong thing
    C.cue(T("verità") - 0.02, "thud", -7, 0.1)
    C.cue(T("verità"), "stamp", -12, 0.1)
    C.cue(T("sbagliata", c[3]) - 0.05, "stamp", -10, 0.0)
    no = T("stupida") + 0.25
    C.cue(no, "glitch", -14, -0.2)
    C.cue(no + 0.15, "confirm", -12, 0.0)
    C.cue(c[4] + 0.3, "impact_low", -9, -0.3)
    C.cue(c[4] + 0.6, "thud", -10, -0.2)
    C.cue(T("volevi"), "stamp", -7, 0.0)
    # the skill is built, the plan grilled
    for k in range(5):
        C.cue(c[5] + 0.25 + k * 0.45, "thud", -15, 0.3)
    C.cue(T("grill-me", c[5]) - 0.3, "film_run", -15, 0.0)
    C.cue(T("grill-me", c[5]) - 0.3, "stamp", -11, 0.4)
    # the editor stops; the questions; the plan ticks
    C.cue(c[6] + 0.15, "stamp", -11, 0.4)
    C.cue(T("riga"), "pop", -12, -0.3)
    d = T("domanda") - 0.2
    C.typed("/grill-me aggiungi il login", d - 0.6, 60, -19, -0.2, seed=2)
    for k in range(4):
        C.cue(d + 0.25 + k * 0.55, "blip", -14, 0.2)
    for k in range(5):
        C.cue(c[7] + 0.15 + k * 0.3, "tick_soft", -12, 0.0)
    # tdd: fail, then pass
    C.typed("test('login', () => {", c[8] + 0.1, 40, -18, -0.3, seed=4)
    C.cue(T("fallisce"), "glitch", -12, 0.3)
    C.cue(T("passare"), "confirm", -9, 0.3)
    C.cue(T("passare") + 0.05, "shimmer", -12, 0.0)
    # the bug, the loop
    C.cue(c[9] + 0.1, "film_run", -16, 0.0)
    for k in range(6):
        C.cue(T("ciclo") - 0.05 + k * 0.15, "blip", -15, (k - 2.5) * 0.15)
    # architecture: the scan, the report, the clean-up
    C.cue(c[10] + 0.3, "pop", -12, -0.2)
    C.cue(T("analizza") - 0.1, "riser", -18, 0.0)
    r = T("report") - 0.3
    for k in range(5):
        C.cue(r + 0.1 + k * 0.12, "tick_soft", -13, 0.2)
    C.cue(T("sistemare"), "stamp", -9, 0.2)
    # install: the stopwatch, the command, the marketplace, the arm
    for k in range(8):
        C.cue(c[12] + k * 0.25, "tick_soft", -16, 0.0)
    C.typed("claude plugin install mattpocock-skills@claude-plugins-official", c[13] + 0.25, 34, -18, 0.0, seed=6)
    C.cue(T("ufficiale"), "stamp", -9, 0.4)
    C.cue(T("aggiorna") - 0.1, "drag", -14, -0.2)
    C.cue(T("aggiorna") + 0.6, "confirm", -13, 0.2)
    # other agents, npx, the folder, setup
    C.cue(c[15] + 0.15, "pop", -12, -0.4)
    C.cue(c[15] + 0.45, "pop", -12, 0.4)
    C.typed("npx skills@latest add mattpocock/skills", T("npx") - 0.2, 30, -18, 0.0, seed=8)
    C.cue(c[16] + 0.4, "pop", -13, 0.3)
    f0 = T("mattpocock/skills", c[16]) + 0.3
    for k in range(5):
        C.cue(f0 + 0.1 + k * 0.2, "blip", -14, 0.2)
    C.typed("/setup-matt-pocock-skills", c[17] + 0.2, 32, -18, 0.0, seed=10)
    C.cue(T("volta"), "impact_mid", -12, 0.3)
    C.cue(T("pronto") + 0.05, "whoosh_long", -10, 0.0)
    C.cue(T("pronto") + 0.1, "riser", -16, 0.0)
    # comment GRILL
    g = T("GRILL", c[18])
    C.typing(g - 0.1, g + 0.3, 5, -14, seed=12)
    C.cue(g + 0.4, "enter", -10, 0.0)
    C.cue(g + 0.45, "shimmer", -12, 0.3)
    for k in range(3):
        C.cue(g + 0.6 + k * 0.25, "whoosh_short", -15, 0.5)
