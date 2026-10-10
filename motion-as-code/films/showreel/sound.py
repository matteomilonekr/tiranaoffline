"""Sound design of `showreel`: music and effects only, no voice. Everything sits on the 120 bpm grid the plate
cuts on (scenes/showreel.ts): bar b starts at 2b seconds, beat k of it at 2b + 0.5k.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film showreel     # -> out/showreel/mix.wav

The film's audio/voiceover.mp3 is silence (or this mix, once made): with NO_VOICE the mixer only takes its length.
"""
NO_VOICE = True
MUSIC_DB = -15.0
BAR, BEAT = 2.0, 0.5
# the shots' first bars (as PLAN in the scene) and how each one comes in
CUTS = {"draw": 1, "morph": 2, "ui": 3, "chart": 5, "zoom": 6, "swarm": 7, "palette": 8, "outro": 9}


def phrases(W):
    return [(0.0, W.duration - 0.05, [(0.0, "intro"), (2 * BAR, "drive"), (3 * BAR, "groove"), (5 * BAR, "drive"),
                                      (8 * BAR, "light"), (9 * BAR, "pad")])]


def cues(W, C):
    at = lambda bar, beat=0.0: bar * BAR + beat * BEAT
    # the transitions, each with its own sound, starting just before the cut
    flavour = {"draw": "shutter", "morph": "whoosh_long", "ui": "whoosh_short", "chart": "whoosh_long", "zoom": "glitch",
               "swarm": "reverse_suck", "palette": "riser", "outro": "impact_mid"}
    for shot, bar in CUTS.items():
        c = at(bar)
        C.cue(c - 0.16, "whoosh_short", -15, 0.0)
        C.cue(c - (0.45 if flavour[shot] in ("riser", "reverse_suck") else 0.05), flavour[shot], -11, 0.0)
    # open: the letters rise from the centre, the code decodes, a step of the rule on each beat
    for i in range(6):
        C.cue(0.12 + abs(i - 2.5) * 0.045, "tick_soft", -15, (i - 2.5) * 0.15)
    C.typing(1.0, 1.45, 6, -16, 0.0, seed=1)
    for k in range(4):
        C.cue(at(0, k), "blip", -16, (k - 1.5) * 0.2)
    # draw: the pen, the glint, the underline
    C.cue(at(1) + 0.05, "pen_line", -12, -0.2)
    C.cue(at(1) + 1.15, "shimmer", -12, 0.2)
    C.cue(at(1) + 1.0, "pen_scratch", -14, 0.3)
    # morph: a shape on each beat
    for k in range(1, 4):
        C.cue(at(2, k), "pop", -10, (k - 2) * 0.3)
    C.cue(at(2, 3) + 0.05, "bloom_hit", -15, 0.0)
    # ui: clicks on beats 1, 3, 5, 6; the box stretching; the toast
    for beat in (1, 3, 5, 6):
        C.cue(at(3, beat), "mouse", -9, 0.2)
    C.cue(at(3, 1.2), "drag", -15, 0.0)
    C.cue(at(3, 4), "drag", -14, 0.0)
    C.cue(at(3, 6.6), "confirm", -11, 0.0)
    # chart: the odometer rolls, the bars land
    for k in range(10):
        C.cue(at(5) + k * 0.09, "tick_soft", -16, 0.0)
    for i in range(5):
        C.cue(at(5) + 0.25 + i * 0.09 + 0.3, "pop", -15, (i - 2) * 0.25)
    # zoom: a push on each beat
    for k in range(1, 4):
        C.cue(at(6, k) - 0.4, "whoosh_short", -13, 0.0)
        C.cue(at(6, k), "thud", -14, 0.0)
    # swarm: the particles gather, then burst on beat 3
    C.cue(at(7) + 0.05, "shimmer", -13, 0.0)
    C.cue(at(7, 3) - 0.6, "riser", -15, 0.0)
    C.cue(at(7, 3), "impact_mid", -8, 0.0)
    C.cue(at(7, 3) + 0.02, "spark", -11, 0.3)
    # palette: three keys, the result, enter
    C.typing(at(8) + 0.35, at(8) + 0.35 + 3 / 7, 3, -14, 0.0, seed=3)
    C.cue(at(8) + 1.2, "enter", -11, 0.0)
    C.cue(at(8) + 1.25, "confirm", -12, 0.2)
    # outro: the drop, the title, the line typed under it
    C.cue(at(9) + 0.02, "sub_drop", -9, 0.0)
    C.cue(at(9) + 0.15, "shimmer", -12, 0.0)
    C.typed("11 blocchi dalla lista Opus 5.5", at(9) + 0.55, 40, -18, 0.0, seed=5)
