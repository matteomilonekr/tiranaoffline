"""Sound design of `magia`: a hit or a whoosh on every cut (the plate cuts on the narrator's words, scenes/magia.ts),
a sound for each thing that lands (the orbit, the tiles, the brain, the neon, the touch, the TV, the bar, the eye, the
panel, the column, the diamond, the knight), and a bed that is dark under the green shots and drives under the rest.

    uv run --no-project --with numpy python analysis/sfx_mix.py --film magia     # -> out/magia/mix.wav
"""
import unicodedata

MUSIC_DB = -21.0
LEAD = 0.12


def key(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn" and ch.isalnum()).lower()


def at(W, q, after=0.0):
    k = key(q)
    for l in W.lines:
        for w in l["words"]:
            if key(w["w"]) == k and w["start"] >= after - 1e-6:
                return w["start"]
    raise SystemExit(f"word not found: {q!r} after {after:.2f}")


def line(W, i):
    return W.lines[i]["words"][0]["start"]


def shots(W):
    """The plate's cuts, as scenes/magia.ts computes them."""
    end = W.lines[-1]["end"]
    return {
        "domanda": 0.0, "brand": at(W, "perché") - 0.08, "testa": at(W, "ti", at(W, "brand")) - LEAD,
        "magia": line(W, 1) - LEAD, "design": line(W, 2) - LEAD, "tv": line(W, 3) - LEAD,
        "emozione": at(W, "emozione") - 0.18, "cinetico": line(W, 4) - LEAD, "attenzione": at(W, "cattura") - LEAD,
        "metafore": line(W, 5) - LEAD, "parola": at(W, "senza") - LEAD, "decorazione": line(W, 6) - LEAD,
        "strategia": line(W, 7) - LEAD, "fine": end + 0.55,
    }


def phrases(W):
    s = shots(W)
    return [
        (0.0, s["magia"] - 0.05, [(0.0, "intro"), (s["brand"], "groove")]),
        (s["magia"], s["tv"] - 0.05, [(s["magia"], "pad")]),
        (s["tv"], s["fine"] - 0.05, [(s["tv"], "drive"), (s["metafore"], "groove"), (s["decorazione"], "drive")]),
    ]


def cues(W, C):
    s = shots(W)
    # the question: the disc and the orbit, each word a hit
    C.cue(0.02, "bloom_hit", -12, 0.0)
    C.cue(0.15, "pop", -12, 0.0)
    C.cue(at(W, "Ti") - 0.05, "impact_low", -11, -0.2)
    C.cue(at(W, "chiesto") - 0.05, "impact_low", -10, 0.2)
    # the brands: the tiles whip up and land
    C.cue(s["brand"] - 0.05, "whoosh_long", -10, 0.0)
    for k in range(4):
        C.cue(s["brand"] + 0.12 + k * 0.06, "pop", -14, -0.4 + k * 0.27)
    C.cue(at(W, "brand") - 0.15, "impact_mid", -9, 0.0)
    # the brain drops in
    C.cue(s["testa"] + 0.05, "whoosh_short", -12, 0.0)
    C.cue(at(W, "restano") + 0.15, "thud", -9, 0.0)
    C.cue(at(W, "testa") - 0.12, "impact_low", -13, 0.0)
    # dark green: the pegasus, and the neon flickering on
    C.cue(s["magia"] - 0.08, "sub_drop", -8, 0.0)
    C.cue(s["magia"], "whoosh_long", -13, 0.4)
    C.cue(at(W, "magia") - 0.05, "glitch", -16, 0.0)
    C.cue(at(W, "magia") + 0.05, "shimmer", -12, 0.0)
    # the hand touches the word
    C.cue(s["design"], "impact_low", -12, 0.0)
    C.cue(at(W, "design", line(W, 2)) - 0.25, "riser", -15, 0.0)
    C.cue(at(W, "design", line(W, 2)) + 0.35, "bloom_hit", -10, 0.0)
    # the TV slides in and lands; its screen comes on
    C.cue(s["tv"] - 0.05, "whoosh_long", -11, -0.5)
    C.cue(s["tv"] + 0.35, "thud", -11, 0.0)
    C.cue(s["tv"] + 0.4, "film_run", -17, 0.0)
    # the red bar and the words sliding in
    C.cue(s["emozione"], "whoosh_short", -11, 0.6)
    C.cue(at(W, "messaggio") - 0.08, "impact_low", -12, 0.3)
    # the word that squeezes, the bar through it
    C.cue(s["cinetico"], "impact_mid", -10, 0.0)
    C.cue(at(W, "cinetico") - 0.1, "whoosh_short", -12, -0.3)
    C.cue(at(W, "cinetico") - 0.05, "pen_line", -14, 0.0)
    # the card and the eye rolling in
    C.cue(s["attenzione"], "thud", -11, 0.0)
    C.cue(s["attenzione"] + 0.1, "drag", -13, -0.6)
    C.cue(at(W, "due") - 0.08, "blip", -14, 0.0)
    # the panel swinging in
    C.cue(s["metafore"], "whoosh_long", -11, 0.6)
    C.cue(s["metafore"] + 0.35, "impact_low", -12, 0.0)
    C.cue(at(W, "spiegano") - 0.05, "shimmer", -15, 0.0)
    # the word and its reflection
    C.cue(at(W, "parola") - 0.1, "reverse_suck", -12, 0.0)
    C.cue(at(W, "parola") - 0.05, "impact_mid", -8, 0.0)
    # the column rises, the diamond drops and glints
    C.cue(s["decorazione"], "whoosh_short", -12, 0.0)
    C.cue(at(W, "decorazione") - 0.05, "impact_mid", -9, 0.0)
    C.cue(at(W, "decorazione") + 0.1, "drag", -12, 0.0)
    C.cue(at(W, "decorazione") + 0.4, "thud", -12, 0.0)
    C.cue(at(W, "decorazione") + 0.8, "spark", -12, 0.2)
    # the knight comes in and moves
    C.cue(s["strategia"], "whoosh_long", -11, 0.6)
    C.cue(at(W, "muove") - 0.1, "whoosh_short", -13, 0.0)
    C.cue(at(W, "muove") + 0.38, "thud", -9, -0.2)
    # the end card
    C.cue(s["fine"], "sub_drop", -12, 0.0)
