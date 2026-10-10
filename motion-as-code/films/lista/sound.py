"""Sound design of `lista`: no voice. As in the reel it clones, every touch of the interface has its sound (the click,
the keys, the swing of the hand, the ticks, the marker, the toggle, each morph), over a light bed that changes with
the ground: light on the white note, a groove on the dark button and the widgets, a pad under the icon.
Times are the plate's (scenes/lista.ts).

    uv run --no-project --with numpy python analysis/sfx_mix.py --film lista     # -> out/lista/mix.wav
"""
NO_VOICE = True
MUSIC_DB = -21.0
TICKS = [3.5, 3.95, 4.4]


def phrases(W):
    return [(0.0, 4.9, [(0.0, "light")]), (5.12, 9.85, [(5.12, "groove")]), (10.16, W.duration - 0.05, [(10.16, "pad")])]


def cues(W, C):
    # the folder: a click, it opens, the note rises and its title is typed
    C.cue(0.05, "mouse", -9, 0.2)
    C.cue(0.16, "pop", -13, 0.0)
    C.cue(0.3, "drag", -17, 0.0)
    C.typed("Cose da fare oggi", 0.38, 24, -18, 0.0, seed=3)
    # the hand swings off to the left and back
    C.cue(1.3, "whoosh_short", -17, 0.5)
    C.cue(1.62, "whoosh_short", -16, -0.6)
    C.cue(1.98, "whoosh_short", -16, -0.2)
    # the tap, and the note pulled out while the folder drops away
    C.cue(2.3, "mouse", -9, 0.0)
    C.cue(2.5, "whoosh_long", -15, 0.0)
    C.cue(2.62, "drag", -15, 0.0)
    for k in range(4):
        C.cue(2.64 + k * 0.09, "tick_soft", -18, -0.3 + k * 0.2)
    # three ticks, each with the marker across the words
    for i, tk in enumerate(TICKS):
        C.cue(tk, "blip", -12, -0.2 + i * 0.2)
        C.cue(tk + 0.04, "confirm", -18, 0.0)
        C.cue(tk + 0.05, "pen_scratch", -15, -0.3 + i * 0.3)
    # the hand takes the note; it becomes the button as the ground goes dark
    C.cue(4.6, "whoosh_short", -17, 0.0)
    C.cue(4.86, "drag", -13, 0.0)
    C.cue(4.95, "whoosh_long", -12, 0.0)
    C.cue(5.12, "impact_low", -13, 0.0)
    # the pointer presses it: the click and the toggle
    C.cue(6.42, "mouse", -8, 0.3)
    C.cue(6.45, "pop", -11, 0.3)
    C.cue(6.5, "confirm", -15, 0.2)
    # the button becomes the reading widget
    C.cue(6.95, "whoosh_short", -13, 0.0)
    C.cue(7.0, "bloom_hit", -14, 0.0)
    C.cue(7.32, "tick_soft", -17, -0.3)
    # the swipe: the ground lights up, the widget stretches wide
    C.cue(7.78, "whoosh_long", -12, -0.5)
    C.cue(8.0, "pop", -12, 0.0)
    C.cue(8.05, "shimmer", -18, 0.2)
    # the grab: it grows, the week fills in
    C.cue(8.84, "drag", -13, 0.0)
    C.cue(9.04, "whoosh_short", -13, 0.0)
    C.cue(9.08, "pop", -12, 0.0)
    for k in range(7):
        C.cue(9.36 + k * 0.04, "tick_soft", -19, -0.45 + k * 0.15)
    # the turn into the icon, and the icon landing
    C.cue(9.88, "reverse_suck", -13, 0.0)
    C.cue(9.92, "whoosh_long", -13, 0.0)
    C.cue(10.16, "impact_mid", -9, 0.0)
    C.cue(10.18, "bloom_hit", -12, 0.0)
    C.cue(10.25, "shimmer", -14, 0.0)
