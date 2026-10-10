"""Sound design of `plugins`: the cue sheet and the music's phrases, placed by the same words the plates use.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film plugins     # -> out/plugins/mix.wav

Every time below is the time a plate gives the same moment (the plate's file and function are named), so a
new read re-times the sound with the picture. Effects are the kit's (audio/sfx, made by analysis/make_sfx.py);
a WAV of the same name in films/plugins/audio/sfx/ replaces one for this film only.
"""
import unicodedata

CUT_LEAD = 0.18  # as timeline.ts
OVERLAP = 0.42  # as _stage.ts: the circle wipe that opens a plate
MUSIC_DB = -20.0  # a reel: the bed a little more present than the demo's (-21.5)


def key(s):
    """As _stage.ts capKey: no accents, no case, letters and digits only."""
    s = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn" and ch.isalnum()).lower()


def at(W, q, after=0.0, end=False):
    """As _stage.ts wordAt: the first word reading q from `after` on (its start, or its end)."""
    k = key(q)
    for l in W.lines:
        for w in l["words"]:
            if key(w["w"]) == k and w["start"] >= after - 1e-6:
                return w["end"] if end else w["start"]
    raise SystemExit(f"word not found: {q!r} after {after:.2f}")


def cuts(W):
    """The plates' starts, as timeline.ts."""
    return {k: W.cut(q) for k, q in [("superpowers", "Il primo è Superpowers"), ("karpathy", "Il secondo sono"), ("adhd", "Il terzo è"),
                                      ("octopus", "E infine Claude Octopus"), ("cta", "Se vuoi provarli")]}


def phrases(W):
    """The music: one groove from the first frame, a gear up for the octopus, a dead stop (with a clap roll)
    before the call to action, which comes in on a crash and plays to the end."""
    b = cuts(W)
    mille = at(W, "mille")
    return [
        (0.0, b["cta"] - 0.3, [(0.0, "intro"), (b["superpowers"], "groove"), (b["karpathy"], "light"), (mille - 0.25, "groove"),
                               (b["adhd"], "groove"), (b["octopus"], "drive")]),
        (b["cta"], W.duration - 0.05, [(b["cta"], "drive")]),
    ]


def cues(W, C):
    b = cuts(W)
    T = lambda q, after=0.0: at(W, q, after)

    # every plate opens with its circle wipe; every plugin lands in the strip (_stage.ts powerStrip)
    for k in b:
        C.cue(b[k] - 0.02, "whoosh_long", -13, 0.4)
    for i, q in enumerate(["Superpowers", "Karpathy", "i-have-adhd", "Octopus"]):
        t = T(q)
        C.cue(t + 0.05, "whoosh_short", -16, 0.6)
        C.cue(t + 0.22, "thud", -8, 0.6)
        C.cue(t + 0.24, "enter", -10, 0.6)
        C.cue(t + 0.3, "shimmer", -17, 0.6)

    # ---------------------------------------------------------------- hook.ts
    non, vibe, inst, four = T("Non"), T("vibe"), T("installato"), T("quattro")
    C.cue(non - 0.02, "whoosh_short", -12, 0.5)  # the barrier swings down
    C.cue(non + 0.22, "impact_mid", -9, 0.4)
    C.cue(non + 0.24, "thud", -8, 0.4)
    k = 0
    while non + 0.3 + k / 3 < b["superpowers"]:  # the lamps blink, left, right
        C.cue(non + 0.3 + k / 3, "blip", -24, -0.4 if k % 2 else 0.4)
        k += 1
    C.cue(vibe, "pen_scratch", -13, -0.2)
    C.cue(vibe + 0.12, "pen_scratch", -15, -0.2)
    C.cue(inst, "glitch", -15, -0.2)
    C.typed("x bloccato — 0 plugin installati", inst, 70, seed=1)
    C.cue(four, "pop", -7, 0.6)  # the power strip
    C.cue(four + 0.05, "shimmer", -18, 0.6)

    # ---------------------------------------------------------------- superpowers.ts
    T0 = b["superpowers"]
    sw = {q: T(q, T0) for q in ["trecentomila", "impedisce", "buttarsi", "chiede", "costruendo", "specifica", "firmi", "subagent"]}
    test, hours = T("test", sw["subagent"]), T("ore", sw["subagent"])
    plan = T("piano", hours)
    C.cue(T0 + 0.15, "pop", -11, -0.4)  # repo()
    C.cue(sw["trecentomila"] - 0.35, "pop", -11, -0.4)
    for i in range(12):  # the stars roll up
        C.cue(sw["trecentomila"] - 0.1 + i * 0.1, "tick_soft", -17 + i * 0.4, -0.4)
    C.cue(sw["trecentomila"] + 1.1, "shimmer", -13, -0.4)
    stop = sw["buttarsi"] + 0.45  # jumpIn()
    C.cue(sw["impedisce"] - 0.1, "whoosh_short", -16, -0.3)
    C.typed("> aggiungi il checkout", sw["impedisce"] - 0.1, 60, seed=2, pan=-0.3)
    C.typed("function checkout(cart) {", sw["buttarsi"], 60, seed=3, pan=-0.3)
    C.typed("  const tot = cart.reduce(", sw["buttarsi"] + 0.4, 60, seed=4, pan=-0.3)
    C.cue(stop, "stamp", -5, -0.1)
    C.cue(stop, "impact_mid", -10, -0.1)
    C.cue(sw["chiede"] - 0.05, "whoosh_short", -15, -0.4)  # brainstorm()
    for i, (dt, s) in enumerate([(0.2, "? Cosa stai costruendo?")]):
        C.typed(s, sw["chiede"] + dt, 60, seed=5 + i, pan=-0.4)
    for i, dt in enumerate([0.25, 0.6, 0.85]):
        C.typed("  › freelance", sw["costruendo"] + dt, 60, seed=7 + i, pan=-0.4)
    C.cue(sw["costruendo"] + 0.05, "pop", -10, -0.3)  # held(): the sign
    C.cue(sw["specifica"] - 0.05, "pop", -9, 0.4)  # spec()
    C.cue(sw["firmi"], "pen_line", -9, 0.4)
    C.cue(sw["firmi"] + 0.6, "stamp", -7, 0.4)
    C.cue(sw["subagent"] - 0.2, "whoosh_short", -15, -0.5)  # tdd()
    for i in range(3):
        C.cue(sw["subagent"] - 0.15 + i * 0.16, "pop", -12, 0.3)
    C.cue(test - 0.1, "blip", -10, -0.6)
    green = min(test + 0.55, hours - 0.3)
    C.cue(green, "confirm", -9, -0.6)
    C.cue(hours - 0.05, "whoosh_short", -15, 0.0)  # hoursOnPlan()
    for i in range(16):  # the clock races
        C.cue(hours + i * 0.12 * (1 + i / 16), "tick_soft", -16, 0.5)
    for i in range(5):
        C.cue(hours + 0.1 + (plan + 0.2 - hours - 0.1) * i / 4, "tick_soft", -11, -0.4)
    C.cue(hours + 0.5, "pop", -11, 0.5)
    C.cue(plan + 0.25, "stamp", -7, -0.2)

    # ---------------------------------------------------------------- karpathy.ts
    T0 = b["karpathy"]
    kw = {q: T(q, T0) for q in ["Karpathy", "file", "CLAUDE.md", "lamentela", "Andrej", "mille", "cento", "Quattro"]}
    C.typed("> /plugin marketplace add", T0 + 0.1, 70, seed=10)  # install()
    C.typed("  forrestchang/andrej-karpathy-skills", T0 + 0.5, 70, seed=11)
    C.cue(kw["Karpathy"] + 0.35, "confirm", -11)
    C.cue(kw["file"] - 0.1, "whoosh_short", -13, -0.4)  # claudeMd()
    C.cue(kw["file"] - 0.05, "pop", -10, -0.4)
    C.cue(kw["CLAUDE.md"] + 0.35, "stamp", -7, -0.3)
    C.cue(kw["lamentela"] - 0.05, "pop", -9, 0.5)  # complaint()
    C.cue(kw["lamentela"], "glitch", -12, 0.5)
    C.cue(kw["Andrej"] - 0.05, "blip", -12, 0.5)
    C.cue(kw["mille"] - 0.25, "riser", -14, -0.4)  # lines(): the printout rises
    C.cue(kw["mille"] - 0.2, "film_run", -16, -0.4)
    for i in range(10):
        C.cue(kw["mille"] + i * 0.07, "tick_soft", -16, 0.4)
    C.cue(kw["cento"], "reverse_suck", -13, -0.3)
    C.cue(kw["cento"] + 0.35, "thud", -8, -0.4)
    for i in range(9):
        C.cue(kw["cento"] + i * 0.066, "tick_soft", -16, 0.4)
    C.cue(kw["cento"] + 0.55, "stamp", -6, 0.4)
    rules = [T(q, kw["Quattro"]) for q in ["pensa", "resta", "tocca", "dimostra"]]
    done = [rules[1], rules[2], rules[3], at(W, "funziona", kw["Quattro"], end=True) + 0.05]
    C.cue(kw["Quattro"] - 0.1, "thud", -9)  # board()
    for i in range(4):
        C.cue(rules[i] - 0.08, "pop", -9, -0.3 if i % 2 == 0 else 0.3)
        C.cue(done[i] - 0.12, "pen_scratch", -12, 0.3 if i % 2 == 0 else -0.3)
        C.cue(done[i] - 0.02, "confirm", -16, 0.3 if i % 2 == 0 else -0.3)

    # ---------------------------------------------------------------- adhd.ts
    T0 = b["adhd"]
    aw = {q: T(q, T0) for q in ["impedisce", "seppellire", "Niente", "ottima", "spero", "Prima", "prossima", "passi", "numerati", "cinque"]}
    utile = at(W, "utile", aw["spero"], end=True)
    C.cue(T0 + 0.15, "pop", -10)  # answer()
    falls = [aw["impedisce"] + 0.1 + i * 0.35 if i < 2 else aw["seppellire"] - 0.1 + (i - 2) * 0.1 for i in range(8)]
    for i, t in enumerate(falls):  # pile(): the slips fall and land
        C.cue(t, "whoosh_short", -21, (i % 3 - 1) * 0.4)
        C.cue(t + 0.28, "tick_soft", -12, (i % 3 - 1) * 0.4)
    C.cue(aw["seppellire"] + 0.4, "thud", -12)
    C.cue(aw["Niente"] - 0.1, "pop", -10, -0.5)  # shredder()
    C.cue(aw["Niente"] + 0.15, "pop", -12, 0.5)  # the sticky note
    for t in [aw["ottima"] - 0.05, aw["spero"] - 0.05]:
        C.cue(t, "drag", -13, -0.2)
        C.cue(t + 0.35, "film_run", -9, -0.5)  # the blades (cut short by the next sound's room)
        C.cue(t + 0.4, "glitch", -17, -0.5)
    clear = utile + 0.1
    C.cue(clear, "whoosh_long", -12)
    C.cue(clear + 0.45, "shimmer", -11)
    C.cue(clear + 0.45, "confirm", -12)
    C.cue(aw["Prima"] - 0.05, "whoosh_short", -14)  # reply()
    C.typed("ORA › npm i jsonwebtoken@latest", aw["Prima"] - 0.02, 70, seed=20)
    C.typed("      poi modifica src/auth.ts:42", aw["prossima"] + 0.15, 70, seed=21)
    C.cue(aw["Prima"] + 0.35, "blip", -10, 0.5)
    C.typed("1. Sostituisci verifyToken (r. 42-58)", aw["passi"] - 0.05, 70, seed=22)
    C.typed("2. Esegui npm test -- auth.spec.ts", aw["passi"] + 0.3, 70, seed=23)
    C.typed("3. Apri src/auth.ts e ricontrolla", aw["numerati"] + 0.25, 70, seed=24)
    for i in range(5):
        C.cue(aw["cinque"] + i * 0.06, "tick_soft", -13, 0.2)
    C.cue(aw["cinque"] + 0.2, "stamp", -6, 0.3)

    # ---------------------------------------------------------------- octopus.ts
    T0 = b["octopus"]
    ow = {q: T(q, T0) for q in ["Octopus", "manda", "dodici", "Codex", "Copilot", "Grok", "segnala", "punto", "d'accordo", "pubblichi"]}
    C.cue(ow["Octopus"] - 0.15, "reverse_suck", -14, 0.5)  # octopus(): up from behind the counter
    C.cue(ow["Octopus"] + 0.2, "pop", -6, 0.5)
    C.cue(ow["Octopus"] + 0.25, "bloom_hit", -17, 0.5)
    C.cue(ow["manda"] - 0.05, "pop", -10, 0.2)  # task()
    for i in range(12):  # grid(): the cards, then the copies fly
        C.cue(ow["dodici"] - 0.2 + i * 0.045, "tick_soft", -14, -0.6 + 1.2 * (i % 4) / 3)
        if i % 3 == 0:
            C.cue(ow["dodici"] + 0.05 + i * 0.05, "whoosh_short", -20, -0.6 + 1.2 * (i % 4) / 3)
    for q, pan in [("Codex", -0.6), ("Copilot", 0.2), ("Grok", 0.2)]:
        C.cue(ow[q], "blip", -9, pan)
    e2 = ow["segnala"] - 0.2  # debate()
    C.cue(e2, "whoosh_short", -14)
    C.typed("> /octo:debate monorepo vs microservizi", e2 + 0.05, 80, seed=30)
    C.cue(ow["segnala"], "riser", -19)
    for t in [ow["segnala"] + 0.1, ow["punto"] + 0.1, ow["d'accordo"]]:
        C.cue(t, "pop", -9, -0.5)
        C.cue(t + 0.02, "blip", -14, -0.5)
    C.cue(ow["pubblichi"] - 0.1, "thud", -9, 0.4)  # ship, locked
    C.cue(ow["pubblichi"] - 0.05, "glitch", -15, 0.4)

    # ---------------------------------------------------------------- cta.ts
    T0 = b["cta"]
    cw = {q: T(q, T0) for q in ["commenta", "SENIOR", "mando", "link", "privato"]}
    senior_end = at(W, "SENIOR", T0, end=True)
    C.cue(T0 + 0.55, "bloom_hit", -10)  # hud(): the strip, big, all four in
    C.cue(T0 + 0.6, "shimmer", -12)
    C.cue(cw["commenta"] - 0.15, "whoosh_short", -14)  # comment()
    C.cue(cw["commenta"] - 0.05, "pop", -9)
    C.typing(cw["SENIOR"] - 0.02, cw["SENIOR"] + 0.36, 6, -15, seed=40)
    C.cue(senior_end + 0.1, "enter", -8, 0.5)
    C.cue(senior_end + 0.15, "pop", -8, 0.6)
    C.cue(senior_end + 0.18, "shimmer", -15, 0.6)
    C.cue(cw["mando"] - 0.1, "whoosh_short", -13)  # dm()
    C.cue(cw["mando"] - 0.05, "blip", -9)
    for i in range(4):
        C.cue(cw["link"] - 0.25 + i * 0.12, "tick_soft", -11, -0.5 + i / 3)
    C.cue(cw["privato"] + 0.4, "confirm", -12)
