"""Sound design of `styles`: the cue sheet and the music's phrases, on the same words the plate uses.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film styles     # -> out/styles/mix.wav

The plate (scenes/showcase.ts) flips the card to each style 0.18 s before its line; each flip gets a whoosh and
the badge a pop, each name typed into the list a few keys, and each style a sound of its own, on the moment
its tile does that thing (the tile's time starts at the flip's midpoint).
"""
CUT_LEAD = 0.18
FLIP = 0.26  # as showcase.ts
MUSIC_DB = -20.0

# each style's signature: (seconds into its tile, effect, dB)
SIGNATURE = {
    1: [(0.0, "whoosh_short", -16), (0.35, "stamp", -12)],  # swiss: the red field, the title rising
    2: [(0.05, "tick_soft", -10), (0.5, "tick_soft", -10), (1.0, "tick_soft", -10), (1.5, "tick_soft", -10), (0.4, "impact_mid", -14)],  # kinetic, on the beat
    3: [(0.05, "impact_mid", -8), (0.07, "pop", -6), (0.55, "pop", -8)],  # pop art: the blast, the balloon
    4: [(0.1, "shimmer", -15), (0.55, "pop", -10)],  # flat: the sun, the tree
    5: [(0.45, "thud", -9), (0.65, "thud", -11), (0.85, "thud", -11), (1.05, "thud", -12), (1.1, "pop", -12)],  # clay: letters land
    6: [(0.0, "whoosh_long", -16), (0.9, "confirm", -11)],  # glass: the panel floats up, the toggle
    7: [(0.05, "spark", -12), (0.4, "shimmer", -10)],  # y2k: chrome, the glint
    8: [(0.0, "riser", -14), (0.15, "pen_line", -16), (1.0, "bloom_hit", -15)],  # synthwave: neon written
    9: [(0.0, "shutter", -9), (0.15, "shutter", -10), (0.35, "shutter", -9), (0.6, "shutter", -11)],  # riso: the press
    10: [(0.0, "drag", -12)] + [(0.4 + i * 0.09 + (0.36 if i > 3 else 0), "tick_soft", -9) for i in range(7)],  # collage: letters slapped on
    11: [(0.1, "glitch", -8), (0.65, "glitch", -10), (1.2, "glitch", -10)],  # glitch: the bursts
    12: [(0.2, "reverse_suck", -11), (1.35, "shimmer", -11)],  # particles: gather, form
    13: [(0.05, "pop", -8), (0.22, "pop", -8), (0.45, "pop", -9), (1.15, "mouse", -6)],  # neobrutal: cards, the click
    14: [(0.0, "whoosh_short", -14), (0.6, "thud", -10), (0.95, "thud", -10)],  # bauhaus: the parts land
    15: [(0.0, "pop", -10), (0.12, "pop", -10), (0.2, "pop", -11), (0.28, "pop", -11), (0.36, "pop", -12), (0.44, "pop", -12)],  # memphis
    16: [(0.2, "confirm", -10), (0.6, "shimmer", -13)],  # vaporwave: the window opens
    17: [(0.3, "blip", -9), (0.6, "blip", -11), (0.9, "blip", -11)],  # pixel art: coins
    18: [(0.05 + i * 0.1, "tick_soft", -12) for i in range(6)] + [(0.6, "thud", -12)],  # isometric: blocks rise
    19: [(0.0, "riser", -16), (0.9, "pop", -11)],  # low poly: faces flip in
    20: [(0.0, "pen_line", -10), (0.45, "pen_line", -12), (0.9, "pen_line", -12), (1.1, "pen_scratch", -12)],  # line art
    21: [(0.4 + i * 0.045 * 2, "key_%d" % (1 + i % 4), -14) for i in range(9)] + [(1.25, "enter", -10)],  # ascii: the prompt typed
}


def cut(W, i):
    """The plate's cut before line i (as showcase.ts)."""
    l, prev = W.lines[i], W.lines[i - 1] if i > 0 else None
    s = l["words"][0]["start"]
    return max(s - CUT_LEAD, min(prev["end"] + 0.02, s - 0.02) if prev else 0)


def name_at(l):
    """The start of the style's name: the word after the one ending in a colon."""
    ws = l["words"]
    k = next(i for i, w in enumerate(ws) if w["w"].endswith(":"))
    return ws[k + 1]["start"]


def phrases(W):
    """The music: a driving opening under the montage, a groove through the list that gears up for the second
    ten, a dead stop with a clap roll before the call to action, which comes in on a crash."""
    n = len(W.lines)
    starts = [cut(W, i) for i in range(1, n - 1)]
    cta = cut(W, n - 1)
    return [
        (0.0, cta - 0.3, [(0.0, "drive"), (starts[0], "groove"), (starts[10], "drive"), (starts[19], "light")]),
        (cta, W.duration - 0.05, [(cta, "drive")]),
    ]


def cues(W, C):
    n = len(W.lines)
    hook_end = cut(W, 1)
    # the opening montage: a tick per card
    k = 0
    while k * 0.16 < hook_end - 0.05:
        C.cue(k * 0.16, "tick_soft", -13 + (k % 2) * -3, (k % 3 - 1) * 0.3)
        k += 1
    C.cue(0.0, "whoosh_long", -12)
    C.cue(0.05, "impact_low", -13)
    for i in range(1, n - 1):
        l = W.lines[i]
        t0 = cut(W, i)
        C.cue(t0 - 0.02, "whoosh_short", -12, 0.2)  # the flip
        C.cue(t0 + FLIP / 2, "pop", -10, -0.6)  # the badge
        na = name_at(l)
        C.cue(na - 0.03, "blip", -15, -0.5)  # the red pill in the list
        C.typing(na, na + 0.3, 4, -20, -0.5, seed=i)
        for dt, name, db in SIGNATURE.get(i, []):
            C.cue(t0 + FLIP / 2 + dt, name, db, 0.1)
    # the call to action: the flip to the mosaic, its tiles popping in, the call
    t0 = cut(W, n - 1)
    C.cue(t0 - 0.02, "whoosh_long", -11)
    for i in range(21):
        c, r = i % 6, i // 6
        C.cue(t0 + FLIP / 2 + (c + r) * 0.04, "tick_soft", -14, -0.6 + c * 0.24)
    C.cue(t0 + 0.9, "bloom_hit", -9)
    C.cue(t0 + 0.92, "pop", -6)
    C.cue(t0 + 0.95, "shimmer", -12)
    C.cue(W.lines[n - 1]["end"] + 0.3, "confirm", -12)
