"""The edit: which parts of each clip are kept, and where every moment lands in the final video."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

CUT_MODES = {
    # longest pause kept, padding before a word, padding after a word
    "tight": (0.40, 0.10, 0.16),
    "natural": (0.80, 0.15, 0.25),
    "none": (None, 0.20, 0.35),
}


@dataclass
class Segment:
    clip: str           # clip id
    src_in: float
    src_out: float
    out_in: float = 0.0
    zoom: float = 1.0
    frames: int = 0

    @property
    def dur(self) -> float:
        return self.src_out - self.src_in


def _refine(intervals: List[Tuple[float, float]], energy, duration: float, split_at: Optional[float],
            pre: float, post: float) -> List[Tuple[float, float]]:
    """Fit cut points to the real sound (10 ms loudness frames).

    Word timings from speech recognition are often a bit long at the end of a phrase, so: grow a
    cut point while a word is still sounding, trim silence the timings left in, and cut long
    silences hidden inside a kept part.
    """
    if energy is None or len(energy) < 20:
        return intervals
    import numpy as np
    floor = float(np.percentile(energy, 15))
    loud = float(np.percentile(energy, 90))
    if loud - floor < 10:  # no clear speech/silence contrast (noise, music): trust the word timings
        return intervals
    thr = floor + 0.25 * (loud - floor)
    sound = energy > floor + 0.15 * (loud - floor)
    hop = 0.01
    n = len(energy)
    out: List[Tuple[float, float]] = []
    for a, b in intervals:
        ia, ib = max(0, int(a / hop)), min(n, int(b / hop))
        steps = 0
        while ia > 0 and steps < 20 and energy[ia - 1] > thr:
            ia -= 1
            steps += 1
        steps = 0
        while ib < n - 1 and steps < 30 and energy[ib] > thr:
            ib += 1
            steps += 1
        seg = sound[ia:ib]
        if len(seg) == 0 or not seg.any():
            out.append((ia * hop, ib * hop))
            continue
        first = ia + int(np.argmax(seg))
        last = ia + len(seg) - 1 - int(np.argmax(seg[::-1]))
        a2 = max(ia * hop, first * hop - pre)
        b2 = min(ib * hop, (last + 1) * hop + post)
        start = a2
        if split_at is not None:
            k, k_end = int(a2 / hop), int(b2 / hop)
            while k < k_end:
                if sound[k]:
                    k += 1
                    continue
                j = k
                while j < k_end and not sound[j]:
                    j += 1
                if (j - k) * hop > split_at + pre + post and j < k_end:
                    out.append((start, k * hop + post))
                    start = j * hop - pre
                k = j
        out.append((start, b2))
    return [(max(0.0, x), min(duration, y)) for x, y in out if y - x > 0.05]


def _merge(intervals: List[Tuple[float, float]], min_gap: float = 0.05) -> List[Tuple[float, float]]:
    out: List[List[float]] = []
    for a, b in sorted(intervals):
        if out and a - out[-1][1] <= min_gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def speech_intervals(runs: List[List[dict]], dropped: List[Tuple[float, float]], duration: float, mode: str,
                     energy=None, trim: Optional[Tuple[float, float]] = None) -> List[Tuple[float, float]]:
    """Kept parts of a talking clip.

    runs: words of consecutive kept sentences (a dropped sentence starts a new run).
    dropped: (start, end) of dropped sentences; nothing of them may survive.
    """
    max_pause, pre, post = CUT_MODES.get(mode, CUT_MODES["tight"])
    split_at = 1.2 if max_pause is None else max_pause  # "none" still removes long silences
    result: List[Tuple[float, float]] = []
    for words in runs:
        if not words:
            continue
        raw = []
        a = words[0]["s"] - pre
        for w0, w1 in zip(words, words[1:]):
            if w1["s"] - w0["e"] > split_at:
                raw.append((a, w0["e"] + post))
                a = w1["s"] - pre
        raw.append((a, words[-1]["e"] + post))
        raw = [(max(0.0, x), min(duration, y)) for x, y in raw if y > x]
        result += _merge(_refine(raw, energy, duration, split_at, pre, post), 0.12)
    for zs, ze in dropped:
        clipped = []
        for a, b in result:
            if b <= zs or a >= ze:
                clipped.append((a, b))
                continue
            if a < zs:
                clipped.append((a, zs))
            if b > ze:
                clipped.append((ze, b))
        result = clipped
    final: List[Tuple[float, float]] = []
    for a, b in sorted(result):
        if final and a < final[-1][1]:
            a = final[-1][1]
        if trim:
            a, b = max(a, float(trim[0])), min(b, float(trim[1]))
        if b - a >= 0.12:
            final.append((a, b))
    return final


def visual_interval(duration: float, trim: Optional[Tuple[float, float]] = None) -> List[Tuple[float, float]]:
    if trim:
        a, b = max(0.0, float(trim[0])), min(duration, float(trim[1]))
        return [(a, b)] if b - a > 0.1 else []
    cut_in = min(0.20, duration * 0.05) if duration > 2 else 0.0
    cut_out = min(0.30, duration * 0.05) if duration > 2 else 0.0
    return [(cut_in, duration - cut_out)]


class Timeline:
    def __init__(self, fps: float):
        self.fps = fps
        self.segments: List[Segment] = []
        self.by_clip: Dict[str, List[Segment]] = {}
        self.main_end = 0.0

    def add(self, clip: str, intervals: List[Tuple[float, float]], zoom_cuts: bool) -> None:
        segs = self.by_clip.setdefault(clip, [])
        for k, (a, b) in enumerate(intervals):
            frames = max(1, int(round((b - a) * self.fps)))
            # quantise to whole frames so captions stay in sync over many cuts
            b = a + frames / self.fps
            zoom = 1.0
            if zoom_cuts and len(intervals) > 1 and k % 2 == 1:
                zoom = 1.12
            seg = Segment(clip, a, b, self.main_end, zoom, frames)
            self.segments.append(seg)
            segs.append(seg)
            self.main_end += frames / self.fps

    def to_out(self, clip: str, t: float, prefer: str = "next") -> Optional[float]:
        """Map a time inside a clip to the final video. Times inside cut-out parts snap to the cut."""
        segs = self.by_clip.get(clip) or []
        if not segs:
            return None
        for seg in segs:
            if seg.src_in - 1e-6 <= t <= seg.src_out + 1e-6:
                return seg.out_in + min(t, seg.src_out) - seg.src_in
        if t < segs[0].src_in:
            return segs[0].out_in
        for s0, s1 in zip(segs, segs[1:]):
            if s0.src_out < t < s1.src_in:
                return s1.out_in if prefer == "next" else s0.out_in + s0.dur
        last = segs[-1]
        return last.out_in + last.dur

    def kept(self, clip: str, t: float) -> bool:
        return any(s.src_in - 1e-6 <= t <= s.src_out + 1e-6 for s in self.by_clip.get(clip) or [])

    def clip_range(self, clip: str) -> Optional[Tuple[float, float]]:
        segs = self.by_clip.get(clip) or []
        if not segs:
            return None
        return segs[0].out_in, segs[-1].out_in + segs[-1].dur
