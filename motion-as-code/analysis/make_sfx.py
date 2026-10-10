"""The 28 sound effects in audio/sfx, synthesised from code (numpy only, deterministic).

    uv run --no-project --with numpy python analysis/make_sfx.py

Every effect is a short function of time: filtered noise, swept sines, clicks and envelopes. Same seed,
same file. Run it again after changing a recipe; sfx_mix.py then places them on the cue sheet. You can
also drop in your own WAVs with the same names (48 kHz, mono or stereo).
"""
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "audio", "sfx")
SR = 48000


# ------------------------------------------------------------------ building blocks
def t_(dur):
    return np.arange(int(dur * SR)) / SR


def rng(seed):
    return np.random.default_rng(seed)


def noise(dur, seed):
    return rng(seed).standard_normal(int(dur * SR))


def env_exp(dur, attack, decay):
    t = t_(dur)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4))


def env_ad(dur, attack, release, shape=2.0):
    t = t_(dur)
    up = np.clip(t / max(attack, 1e-4), 0, 1) ** shape
    down = np.clip((dur - t) / max(release, 1e-4), 0, 1) ** shape
    return np.minimum(up, down)


def onepole_lp(x, fc):
    """One-pole low-pass with a cutoff that may vary per sample (array or scalar)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    v = 0.0
    for i in range(len(x)):
        v = a[i] * v + (1 - a[i]) * x[i]
        y[i] = v
    return y


def bandpass(x, f_lo, f_hi):
    """Crude band-pass in the frequency domain (fine for noise sources)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = (f >= f_lo) & (f <= f_hi)
    soft = np.exp(-(((np.log(np.maximum(f, 1)) - np.log(np.sqrt(f_lo * f_hi))) / (0.6 * np.log(f_hi / f_lo) + 1e-9)) ** 2))
    return np.fft.irfft(X * np.where(m, 1.0, soft * 0.15), n=len(x))


def sweep(dur, f0, f1, curve=2.0, shape="sine"):
    """A sine (or triangle) gliding from f0 to f1 (exponential-ish when curve > 1)."""
    t = t_(dur)
    u = (t / dur) ** curve
    f = f0 * (f1 / f0) ** u if f0 > 0 and f1 > 0 else f0 + (f1 - f0) * u
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if shape == "sine" else 2 / np.pi * np.arcsin(np.sin(ph))


def click(dur=0.012, f=3500, seed=0, q=0.7):
    n = noise(dur, seed) * env_exp(dur, 0.0005, dur * 0.18)
    s = sweep(dur, f, f * 0.6) * env_exp(dur, 0.0003, dur * 0.25)
    return q * n + (1 - q) * s


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def pad(x, dur):
    n = int(dur * SR)
    return np.concatenate([x, np.zeros(max(0, n - len(x)))])[:n] if len(x) < n else x


def stereo(x, width=0.0, seed=0):
    """Mono -> stereo, optionally decorrelated a little (Haas-ish) for width."""
    if width <= 0:
        return np.stack([x, x], axis=1)
    d = int(0.004 * width * SR)
    r = np.concatenate([np.zeros(d), x])[: len(x)]
    return np.stack([x, (1 - width) * x + width * r], axis=1)


# ------------------------------------------------------------------ the 28 recipes
def tick_soft():
    return norm(click(0.02, 4200, 1, 0.5), 0.5)


def key(i):
    seed = 10 + i
    body = click(0.035, 1800 + 300 * i, seed, 0.8)
    thock = sweep(0.03, 320 + 40 * i, 180) * env_exp(0.03, 0.001, 0.008)
    x = pad(body, 0.05) + 0.5 * pad(thock, 0.05)
    return norm(x, 0.6)


def whoosh(dur, seed, lo=200, hi=4000):
    n = noise(dur, seed)
    t = t_(dur)
    fc = lo + (hi - lo) * np.sin(np.pi * t / dur) ** 2
    x = onepole_lp(n, fc) - onepole_lp(n, fc * 0.25)
    return norm(x * env_ad(dur, dur * 0.45, dur * 0.5, 1.6), 0.7)


def riser():
    dur = 1.3
    t = t_(dur)
    n = noise(dur, 21)
    x = onepole_lp(n, 300 + 7000 * (t / dur) ** 2) * (t / dur) ** 2
    tone = sweep(dur, 180, 1400, 2.2) * (t / dur) ** 3 * 0.35
    return norm(x + tone, 0.7)


def impact_low():
    dur = 1.4
    body = sweep(dur, 95, 32, 0.6) * env_exp(dur, 0.002, 0.42)
    hit = onepole_lp(noise(dur, 31), 900) * env_exp(dur, 0.0005, 0.05)
    return norm(body + 0.6 * hit, 0.95)


def impact_mid():
    dur = 0.9
    body = sweep(dur, 160, 55, 0.7) * env_exp(dur, 0.001, 0.2)
    crack = bandpass(noise(dur, 32), 1500, 9000) * env_exp(dur, 0.0003, 0.03)
    return norm(body + 0.7 * crack, 0.95)


def thud():
    dur = 0.35
    return norm(sweep(dur, 120, 60, 0.8) * env_exp(dur, 0.001, 0.07) + 0.2 * onepole_lp(noise(dur, 33), 600) * env_exp(dur, 0.0005, 0.02), 0.8)


def pen(dur, seed):
    n = bandpass(noise(dur, seed), 2500, 9000)
    flutter = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 37 * t_(dur) + rng(seed).random() * 6))
    return norm(n * flutter * env_ad(dur, 0.02, 0.05), 0.35)


def spark():
    dur = 0.7
    x = np.zeros(int(dur * SR))
    r = rng(51)
    for _ in range(90):
        i = int(r.random() ** 1.6 * (len(x) - 400))
        c = click(0.004, 5000 + 4000 * r.random(), int(r.integers(1e6)), 0.9) * (0.3 + 0.7 * r.random())
        x[i:i + len(c)] += c
    return norm(x * env_exp(dur, 0.002, 0.25), 0.6)


def glitch():
    dur = 0.6
    t = t_(dur)
    r = rng(61)
    base = sweep(dur, 220, 1800, 1.0, "tri")
    gate = (np.floor(t * 40) % 3 != 0).astype(float)
    crushed = np.round(base * 6) / 6
    stut = np.sign(np.sin(2 * np.pi * (300 + 900 * r.random()) * t))
    x = gate * (0.6 * crushed + 0.25 * stut) + 0.2 * bandpass(noise(dur, 62), 3000, 12000)
    return norm(x * env_ad(dur, 0.005, 0.08, 1.0), 0.6)


def stamp():
    dur = 0.4
    slap = bandpass(noise(dur, 71), 500, 4000) * env_exp(dur, 0.0005, 0.03)
    body = sweep(dur, 140, 70) * env_exp(dur, 0.001, 0.06)
    return norm(slap + body, 0.85)


def pop():
    dur = 0.09
    return norm(sweep(dur, 900, 420, 0.5) * env_exp(dur, 0.001, 0.025), 0.55)


def blip():
    dur = 0.08
    return norm(sweep(dur, 1900, 2100) * env_exp(dur, 0.001, 0.03), 0.4)


def confirm():
    a = sweep(0.12, 880, 880) * env_exp(0.12, 0.002, 0.05)
    b = sweep(0.25, 1320, 1320) * env_exp(0.25, 0.002, 0.09)
    return norm(np.concatenate([a, b]), 0.5)


def enter():
    return norm(pad(click(0.05, 1200, 81, 0.85), 0.12) + 0.7 * pad(sweep(0.06, 180, 90) * env_exp(0.06, 0.001, 0.02), 0.12), 0.8)


def shutter():
    a = click(0.015, 2600, 91, 0.6)
    b = click(0.02, 1700, 92, 0.6)
    return norm(np.concatenate([a, np.zeros(int(0.028 * SR)), b]), 0.6)


def film_run():
    dur = 2.0
    t = t_(dur)
    clicks = np.zeros(len(t))
    for k in range(int(dur * 24)):
        c = click(0.006, 2200, 100 + k, 0.8) * 0.5
        i = int(k / 24 * SR)
        clicks[i:i + len(c)] += c
    hum = 0.25 * sweep(dur, 110, 110) * (0.6 + 0.4 * np.sin(2 * np.pi * 24 * t))
    return norm((clicks + hum) * env_ad(dur, 0.1, 0.3, 1.0), 0.45)


def mouse():
    return norm(np.concatenate([click(0.01, 3000, 111, 0.7), np.zeros(int(0.045 * SR)), 0.6 * click(0.012, 2400, 112, 0.7)]), 0.5)


def drag():
    dur = 0.9
    n = onepole_lp(noise(dur, 121), 1400) - onepole_lp(noise(dur, 121), 300)
    return norm(n * env_ad(dur, 0.15, 0.2, 1.0), 0.3)


def shimmer():
    dur = 1.2
    t = t_(dur)
    x = sum(np.sin(2 * np.pi * f * t + i) * env_exp(dur, 0.01 + 0.03 * i, 0.5 - 0.05 * i) for i, f in enumerate([2093, 2637, 3136, 3951, 4699]))
    return norm(x * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)), 0.35)


def sub_drop():
    dur = 1.0
    return norm(sweep(dur, 160, 28, 0.7) * env_ad(dur, 0.01, 0.6, 1.2), 0.9)


def reverse_suck():
    x = whoosh(0.7, 131, 300, 6000)[::-1] * np.linspace(0.2, 1, int(0.7 * SR)) ** 2
    return norm(x, 0.7)


def bloom_hit():
    dur = 2.4
    body = sweep(dur, 70, 30, 0.5) * env_exp(dur, 0.002, 0.7)
    air = onepole_lp(noise(dur, 141), 2500) * env_exp(dur, 0.002, 0.35)
    ring = shimmer() * 0.4
    return norm(body + 0.5 * air + pad(ring, dur), 0.95)


RECIPES = {
    "tick_soft": tick_soft,
    "key_1": lambda: key(1), "key_2": lambda: key(2), "key_3": lambda: key(3), "key_4": lambda: key(4),
    "whoosh_short": lambda: whoosh(0.35, 201, 300, 5000),
    "whoosh_long": lambda: whoosh(0.8, 202, 150, 4000),
    "riser": riser,
    "impact_low": impact_low,
    "impact_mid": impact_mid,
    "thud": thud,
    "pen_scratch": lambda: pen(0.16, 301),
    "pen_line": lambda: pen(0.45, 302),
    "spark": spark,
    "glitch": glitch,
    "stamp": stamp,
    "pop": pop,
    "blip": blip,
    "confirm": confirm,
    "enter": enter,
    "shutter": shutter,
    "film_run": film_run,
    "mouse": mouse,
    "drag": drag,
    "shimmer": shimmer,
    "sub_drop": sub_drop,
    "reverse_suck": reverse_suck,
    "bloom_hit": bloom_hit,
}
assert len(RECIPES) == 28


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = stereo(x)
    pcm = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in RECIPES.items():
        x = fn()
        fade = int(0.003 * SR)
        x[-fade:] *= np.linspace(1, 0, fade)
        write_wav(os.path.join(OUT, f"{name}.wav"), stereo(x, 0.35 if name in ("whoosh_short", "whoosh_long", "shimmer", "bloom_hit", "riser", "film_run") else 0.0))
        print(f"{name:14s} {len(x) / SR:5.2f} s")
    print(f"wrote {len(RECIPES)} effects to {os.path.relpath(OUT, os.path.dirname(HERE))}")


if __name__ == "__main__":
    main()
