"""Sound design of `salpa`: no voice, no beat to follow. As in the reel it clones, every cut and every thing that lands
has its own sound (a hit, a whoosh, a click, the keys), over a quiet bed. Times are the plate's (scenes/salpa.ts SHOTS).

    uv run --no-project --with numpy python analysis/sfx_mix.py --film salpa     # -> out/salpa/mix.wav
"""
NO_VOICE = True
MUSIC_DB = -21.0
CUT = {"need": 0.0, "hand": 2.0, "line": 3.5, "prompt": 4.0, "copy": 6.0, "visuals": 7.5, "schedule": 9.0,
       "spinner": 10.5, "network": 11.5, "tagline": 13.5, "logo": 15.5}


def phrases(W):
    return [(0.0, 5.9, [(0.0, "pad")]), (6.0, 13.4, [(6.0, "sparse")]), (13.5, W.duration - 0.6, [(13.5, "pad")])]


def cues(W, C):
    c = CUT
    # the problem: an arrow, the words; then the answer, with a low hit on the cut
    C.cue(c["need"] + 0.05, "whoosh_short", -16, -0.3)
    for k in range(6):
        C.cue(c["need"] + 0.12 + k * 0.07, "tick_soft", -19, -0.2 + k * 0.08)
    C.cue(c["hand"] - 0.02, "impact_low", -9, 0.0)
    for k in range(5):
        C.cue(c["hand"] + k * 0.06, "tick_soft", -19, 0.2 - k * 0.08)
    C.cue(c["hand"] + 0.3, "whoosh_short", -17, 0.4)
    # the lines cross, the field opens
    C.cue(c["line"], "pen_line", -14, 0.0)
    C.cue(c["line"] + 0.12, "drag", -15, 0.0)
    # the prompt: chips, keys, the click, then the whip
    for k in range(4):
        C.cue(c["prompt"] + 0.1 + k * 0.07, "blip", -18, -0.3 + k * 0.2)
    C.typed("Lancia il mio brand in 24 ore.", c["prompt"] + 0.2, 24, -15, 0.0, seed=4)
    C.cue(c["prompt"] + 1.52, "mouse", -8, 0.3)
    C.cue(c["prompt"] + 1.55, "enter", -12, 0.3)
    C.cue(c["prompt"] + 1.6, "riser", -15, 0.0)
    C.cue(c["copy"] - 0.25, "whoosh_long", -10, 0.0)
    C.cue(c["copy"], "impact_mid", -7, 0.0)
    # copy: the heading and the code typed, the arcs swinging in
    C.typed("Scrivo i testi.", c["copy"] + 0.15, 22, -15, -0.2, seed=6)
    C.typed("const lancio = salpa.campagna({ brand tono canali scadenza });", c["copy"] + 0.45, 70, -20, -0.3, seed=7, every=3)
    for k in range(3):
        C.cue(c["copy"] + 0.15 + k * 0.09, "whoosh_short", -17, 0.5)
    # visuals: a hit, the cards landing one by one, the spike
    C.cue(c["visuals"] - 0.02, "impact_low", -9, 0.0)
    for k in range(4):
        C.cue(c["visuals"] + 0.33 + k * 0.12, "pop", -13, -0.4 + k * 0.2)
    C.cue(c["visuals"] + 0.25, "shimmer", -14, 0.5)
    # schedule: a glitchy cut, the tree drawing, the rows, the ring, the dive
    C.cue(c["schedule"] - 0.02, "glitch", -11, 0.0)
    C.cue(c["schedule"], "thud", -11, 0.0)
    C.cue(c["schedule"] + 0.15, "pen_line", -16, -0.3)
    for k in range(3):
        C.cue(c["schedule"] + 0.5 + k * 0.1, "blip", -15, -0.2 + k * 0.1)
    C.cue(c["schedule"] + 0.75, "whoosh_short", -14, 0.6)
    C.cue(c["schedule"] + 0.95, "whoosh_long", -14, 0.0)
    C.cue(c["spinner"] - 0.2, "reverse_suck", -11, 0.0)
    C.cue(c["spinner"], "sub_drop", -8, 0.0)
    for k in range(4):
        C.cue(c["spinner"] + 0.3 + k * 0.17, "tick_soft", -16, 0.0)
    # the brand: the pill, the nodes wired one by one
    C.cue(c["network"], "bloom_hit", -10, 0.0)
    C.cue(c["network"] + 0.05, "stamp", -14, 0.0)
    for k in range(8):
        C.cue(c["network"] + 0.6 + k * 0.06, "pop", -17, (k % 4 - 1.5) * 0.3)
    C.cue(c["network"] + 0.4, "shimmer", -16, 0.0)
    C.cue(c["tagline"] - 0.3, "whoosh_long", -12, 0.0)
    C.cue(c["tagline"] + 0.3, "impact_low", -14, 0.0)
    # the logo: a hit from oversize, light on it
    C.cue(c["logo"] - 0.15, "reverse_suck", -13, 0.0)
    C.cue(c["logo"], "impact_mid", -7, 0.0)
    C.cue(c["logo"] + 0.02, "bloom_hit", -10, 0.0)
    C.cue(c["logo"] + 0.1, "shimmer", -12, 0.0)
