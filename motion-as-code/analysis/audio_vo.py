"""Voice analysis of the voiceover -> data/audio.json (the engine's AudioData).

    uv run --no-project --with numpy python analysis/audio_vo.py

The engine was built for music (beats, bars, drum hits). For a voiceover the same file carries:
  - features: loudness envelopes at 100 fps, 0..1: rms (whole signal), low / mid / high (bands),
    vocal (the voice: rms with a faster attack, for reactions to the speech), the rest 0;
  - onsets.vocal: one hit per word start (strength from the word's loudness), from data/lyrics.json,
    plus onsets.syllable from the envelope's rising edges (for small pulses inside words);
  - a nominal beat grid at BPM (default 120: a beat every 0.5 s from t = 0, a bar every 4 beats),
    so f.beat / f.bar / f.beatPhase still tick for idle motion. Nothing in the voice is on it;
  - sections: one per line of the script;
  - duration: the length of the voiceover (the length of the video).

Run it after align_vo.py.
"""
import argparse
import json
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS = 100


def load_audio(path, sr):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def smooth(x, attack, release):
    """One-pole follower with separate attack / release time constants (in frames)."""
    a, r = np.exp(-1.0 / max(attack, 1e-3)), np.exp(-1.0 / max(release, 1e-3))
    y = np.zeros_like(x)
    v = 0.0
    for i, s in enumerate(x):
        k = a if s > v else r
        v = k * v + (1 - k) * s
        y[i] = v
    return y


def norm01(x, lo_pct=5, hi_pct=99.5):
    """Map dB-like values to 0..1 between two percentiles (quiet -> 0, loud -> 1)."""
    lo, hi = np.percentile(x, lo_pct), np.percentile(x, hi_pct)
    return np.clip((x - lo) / max(hi - lo, 1e-6), 0, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--film", help="a film in films/<name>/ (its audio and data/) instead of the demo")
    ap.add_argument("--audio")
    ap.add_argument("--lyrics")
    ap.add_argument("--out")
    ap.add_argument("--bpm", type=float, default=120.0)
    a = ap.parse_args()
    base = os.path.join(ROOT, "films", a.film) if a.film else ROOT
    a.audio = a.audio or os.path.join(base, "audio", "voiceover.mp3")
    a.lyrics = a.lyrics or os.path.join(base, "data", "lyrics.json")
    a.out = a.out or os.path.join(base, "data", "audio.json")

    sr = 24000
    x = load_audio(a.audio, sr)
    dur = len(x) / sr
    hop = sr // FPS
    win = hop * 4
    n = int(np.ceil(len(x) / hop))
    pad = np.concatenate([np.zeros(win // 2, np.float32), x, np.zeros(win, np.float32)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, win)[::hop][:n]
    w = np.hanning(win).astype(np.float32)
    spec = np.abs(np.fft.rfft(frames * w, axis=1)) ** 2
    freqs = np.fft.rfftfreq(win, 1 / sr)

    def band(f0, f1):
        m = (freqs >= f0) & (freqs < f1)
        return 10 * np.log10(spec[:, m].sum(axis=1) + 1e-10)

    rms_db = 10 * np.log10((frames ** 2).mean(axis=1) + 1e-10)
    feats = {
        "rms": norm01(smooth(rms_db, 1.5, 8)),
        "low": norm01(smooth(band(60, 300), 1.5, 8)),
        "mid": norm01(smooth(band(300, 2500), 1.5, 8)),
        "high": norm01(smooth(band(2500, 10000), 1.0, 6)),
        "vocal": norm01(smooth(rms_db, 0.7, 5)),
    }
    for k in ("drums", "bass", "other"):
        feats[k] = np.zeros(n)

    # onsets: one per word (strength = the word's peak loudness), and the envelope's rising edges
    ly = json.load(open(a.lyrics, encoding="utf-8"))
    words = [w for l in ly["lines"] for w in l["words"]]
    voc = feats["vocal"]

    def peak(t0, t1):
        i0, i1 = int(t0 * FPS), max(int(t0 * FPS) + 1, int(t1 * FPS))
        return float(voc[i0:i1].max()) if i1 <= len(voc) else 0.0

    vocal_on = [[round(w["start"], 3), round(0.35 + 0.65 * peak(w["start"], w["end"]), 3)] for w in words]
    d = np.diff(smooth(rms_db, 0.5, 3), prepend=rms_db[0])
    syl = []
    last = -1.0
    for i in range(1, n - 1):
        t = i / FPS
        if d[i] > 1.2 and d[i] >= d[i - 1] and d[i] >= d[i + 1] and voc[min(n - 1, i + 3)] > 0.25 and t - last > 0.09:
            syl.append([round(t, 3), round(float(min(1.0, d[i] / 6)), 3)])
            last = t

    period = 60.0 / a.bpm
    beats = [round(i * period, 4) for i in range(int(dur / period) + 2)]
    downbeats = beats[::4]
    sections = [{"name": f"line{i:02d}", "start": l["start"], "end": l["end"]} for i, l in enumerate(ly["lines"])]

    out = {
        "duration": round(dur, 3),
        "bpm": a.bpm,
        "fps": FPS,
        "beats": beats,
        "downbeats": downbeats,
        "sections": sections,
        "features": {k: [round(float(v), 3) for v in arr] for k, arr in feats.items()},
        "onsets": {"vocal": vocal_on, "syllable": syl, "kick": [], "snare": [], "hat": []},
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {os.path.relpath(a.out, ROOT)}: {dur:.2f}s, {len(vocal_on)} word onsets, {len(syl)} syllable onsets")


if __name__ == "__main__":
    main()
