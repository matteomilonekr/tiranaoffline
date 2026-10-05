"""The music bed: a 120 bpm groove synthesized in numpy (kick, offbeat hats, clap on 2 and 4, a bass line and a
soft pad on Am - F - C - G), arranged on the plates. Used by sfx_mix.py; nothing here reads a sample.

It starts on the reveal ("Questo è Claude Code"), stops dead on the prompt's enter key, starts again on the cut to
"folle", breathes under the explanations, hangs on the pad alone for the final question and plays one full bar
on "pazzesco", cut by the implosion. A phrase that starts after a stop starts on its own downbeat, so the music
lands with the picture. To change the arrangement, edit arrangement(); a style is a density (STYLES).
"""
import numpy as np

SR = 48000
BPM = 120.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
# the progression, one chord a bar: (bass root Hz, pad notes Hz)
PROG = [
    (55.00, (220.00, 261.63, 329.63)),  # Am
    (43.65, (174.61, 220.00, 261.63)),  # F
    (65.41, (196.00, 261.63, 329.63)),  # C (G3 C4 E4)
    (49.00, (196.00, 246.94, 293.66)),  # G
]
# what plays in each style: kick beats, clap beats, hat level, open hats, bass level (0 = none)
STYLES = {
    "intro": dict(kick=(0, 2), clap=(), hat=0.30, open=False, bass=0.8),
    "groove": dict(kick=(0, 1, 2, 3), clap=(1, 3), hat=0.50, open=False, bass=1.0),
    "drive": dict(kick=(0, 1, 2, 3), clap=(1, 3), hat=0.45, open=True, bass=1.0),
    "light": dict(kick=(0, 2), clap=(), hat=0.28, open=False, bass=0.7),
    "sparse": dict(kick=(0,), clap=(), hat=0.0, open=False, bass=0.8),
    "pad": dict(kick=(), clap=(), hat=0.0, open=False, bass=0.0),
}


def arrangement(A):
    """The phrases: (downbeat, end, [(start, style), ...]); a phrase stops dead at its end."""
    b = A["b"]
    return [
        (b["model"], A["t_enter"], [(b["model"], "intro"), (b["prompt"], "groove")]),
        (b["crazy"], b["verdict"], [(b["crazy"], "drive"), (b["code"], "light"), (b["frames"], "groove"), (b["pipeline"], "sparse"),
                                    (A["new_row"], "groove"), (b["edits"], "light"), (A["first_cmd"], "groove")]),
        (b["verdict"], A["t_slam"], [(b["verdict"], "pad")]),
        (A["t_slam"], A["t_imp"], [(A["t_slam"], "drive")]),
    ]


# ------------------------------------------------------------------ instruments (mono, peak about 1)
def _filt(x, lo=None, hi=None):
    """Band-limit a short sound in the frequency domain (raised-cosine edges an octave wide)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= np.clip(np.log2(np.maximum(f, 1) / (lo / 2)), 0, 1) ** 2
    if hi:
        m *= np.clip(1 - np.log2(np.maximum(f, 1) / hi), 0, 1) ** 2
    return np.fft.irfft(np.fft.rfft(x) * m, n)


def _t(sec):
    return np.arange(int(sec * SR)) / SR


def kick():
    t = _t(0.45)
    f = 46 + 120 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26) * np.minimum(1, t / 0.002)
    click = _filt(np.random.default_rng(1).standard_normal(len(t)) * np.exp(-t / 0.003), lo=2000) * 0.35
    return np.tanh(1.6 * (body + click)) / np.tanh(1.6)


def clap():
    rng = np.random.default_rng(2)
    t = _t(0.32)
    x = np.zeros_like(t)
    for d in (0.0, 0.011, 0.023):
        k = t >= d
        x[k] += np.exp(-(t[k] - d) / 0.0055)
    x += 0.55 * np.exp(-np.maximum(0, t - 0.023) / 0.085) * (t >= 0.023)
    y = _filt(rng.standard_normal(len(t)) * x, lo=900, hi=3200)
    return y / np.abs(y).max()


def hat(open_=False):
    rng = np.random.default_rng(3 if open_ else 4)
    t = _t(0.36 if open_ else 0.07)
    y = _filt(rng.standard_normal(len(t)) * np.exp(-t / (0.11 if open_ else 0.016)), lo=7000)
    return y / np.abs(y).max()


def crash():
    rng = np.random.default_rng(5)
    t = _t(2.4)
    y = np.stack([_filt(rng.standard_normal(len(t)) * np.exp(-t / 0.8), lo=3500, hi=14000) for _ in range(2)], axis=1)
    return y / np.abs(y).max()


def bass_note(f0, dur):
    t = _t(dur)
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.22) * np.minimum(1, (dur - t) / 0.015)
    y = np.sin(2 * np.pi * f0 * t) + 0.32 * np.sin(4 * np.pi * f0 * t) + 0.1 * np.sin(6 * np.pi * f0 * t)
    return np.tanh(1.3 * y * env) / np.tanh(1.3)


def pad_chord(notes, dur, cents):
    """A soft chord: each note a few sine harmonics, slightly detuned; slow attack, gentle release."""
    t = _t(dur)
    y = np.zeros_like(t)
    for f in notes:
        f = f * 2 ** (cents / 1200)
        for k, a in ((1, 1.0), (2, 0.35), (3, 0.18), (4, 0.08)):
            y += a * np.sin(2 * np.pi * f * k * t + k)
    env = np.minimum(1, t / 0.35) * np.minimum(1, np.maximum(0, dur - t) / 0.25)
    return y * env / (len(notes) * 1.6)


# ------------------------------------------------------------------ the bed
def bed(A, n):
    """The music for n samples: (dry stereo, reverb send stereo)."""
    dry = np.zeros((n + 3 * SR, 2))
    send = np.zeros_like(dry)
    pump = np.ones(len(dry))  # the kick's sidechain on the pad and the bass
    K, C, Hc, Ho, X = kick(), clap(), hat(), hat(True), crash()

    def put(buf, x, t, gain, pan=0.0):
        i = int(round(t * SR))
        if i < 0 or i >= n:
            return
        x = x if x.ndim == 2 else np.stack([x * np.sqrt(1 - pan), x * np.sqrt(1 + pan)], axis=1)
        m = min(len(x), len(buf) - i)
        buf[i:i + m] += x[:m] * gain

    def hit(x, t, gain, pan=0.0, rev=0.0):
        put(dry, x, t, gain, pan)
        if rev:
            put(send, x, t, gain * rev, pan)

    pad_bus = np.zeros_like(dry)
    bass_bus = np.zeros_like(dry)
    phrases = arrangement(A)
    for p, (down, end, blocks) in enumerate(phrases):
        blocks = sorted(blocks)
        style_at = lambda t: next(s for s0, s in reversed(blocks) if t >= s0 - 1e-6)
        if p in (1, 3):
            hit(X, down, 0.22, rev=0.3)
        # beats (and their halves) from the downbeat to the stop
        nb = int(np.ceil((end - down) / (BEAT / 2)))
        for k in range(nb):
            t = down + k * BEAT / 2
            if t >= end - 0.01:
                break
            st = STYLES[style_at(t)]
            beat, half = divmod(k, 2)
            bar, pos = divmod(beat, 4)
            root, notes = PROG[bar % 4]
            if not half:
                if pos in st["kick"]:
                    hit(K, t, 0.9, rev=0.04)
                    i = int(t * SR)
                    m = min(int(0.4 * SR), len(pump) - i)
                    pump[i:i + m] = np.minimum(pump[i:i + m], 1 - 0.6 * np.exp(-np.arange(m) / (0.13 * SR)))
                if pos in st["clap"]:
                    hit(C, t, 0.34, 0.05, rev=0.35)
                if pos == 0:
                    # the pad: one chord a bar, to the bar's end (or the phrase's)
                    dur = min(BAR, end - t) + 0.25
                    for ch, cents in ((0, -6), (1, 6)):
                        put(pad_bus[:, ch:ch + 1], pad_chord(notes, dur, cents)[:, None], t, 0.5 if st is STYLES["pad"] else 0.32)
            else:
                if st["hat"]:
                    hit(Ho if st["open"] else Hc, t, st["hat"] * (0.16 if st["open"] else 0.2), 0.3 if not st["open"] else -0.2, rev=0.15)
                if st["bass"]:
                    f = root * (2 if pos == 3 else 1)
                    put(bass_bus, bass_note(f, BEAT / 2 - 0.01), t, 0.42 * st["bass"])
        # the fill into the stop: a clap roll on the last beat before the enter key
        if p == 0:
            for j in range(4):
                hit(C, end - BEAT + j * BEAT / 4 - 0.02, 0.12 + 0.06 * j, -0.05, rev=0.35)
        # a stop is a stop: everything this phrase started is cut 25 ms after its end (the reverb rings on)
        i = int(end * SR)
        fade = int(0.025 * SR)
        for buf in (dry, send, pad_bus, bass_bus):
            seg = buf[i:i + int(1.5 * SR)]
            if p + 1 < len(phrases) and phrases[p + 1][0] < end + 1.5:
                seg = seg[: max(0, int((phrases[p + 1][0] - end) * SR))]
            w = np.zeros(len(seg))
            w[: min(fade, len(seg))] = np.linspace(1, 0, min(fade, len(seg)))
            seg *= w[:, None]
    pad_bus = pad_bus * (0.45 + 0.55 * pump)[:, None]
    bass_bus = bass_bus * (0.65 + 0.35 * pump)[:, None]
    dry += pad_bus + bass_bus
    send += pad_bus * 0.4
    return dry[:n], send[:n]


def room(x, rt60=1.3, predelay=0.018):
    """One shared room: convolution with decaying stereo noise (200 Hz - 6 kHz), so music and effects sit together."""
    rng = np.random.default_rng(6)
    t = _t(rt60 * 1.3)
    ir = np.stack([_filt(rng.standard_normal(len(t)) * np.exp(-6.91 * t / rt60), lo=200, hi=6000) for _ in range(2)], axis=1)
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    m = len(x) + len(ir)
    nfft = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft, axis=0) * np.fft.rfft(ir, nfft, axis=0), nfft, axis=0)
    return y[: len(x)]
