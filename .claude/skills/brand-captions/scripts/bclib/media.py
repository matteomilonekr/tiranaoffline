"""Find clips in a folder, read their properties, extract audio, measure loudness."""
from __future__ import annotations

from fractions import Fraction
from pathlib import Path
from typing import Optional

from .common import (AUDIO_EXTS, EDITED_DIRNAME, IMAGE_EXTS, VIDEO_EXTS, WORK_DIRNAME, BCError, ffmpeg,
                     natural_key, probe, read_json, run)


def _fps(stream: dict) -> float:
    for key in ("avg_frame_rate", "r_frame_rate"):
        v = stream.get(key) or "0/0"
        try:
            f = Fraction(v)
            if 1 <= f <= 240:
                return float(f)
        except (ValueError, ZeroDivisionError):
            pass
    return 30.0


def _rotation(stream: dict) -> int:
    rot = 0
    for sd in stream.get("side_data_list") or []:
        if "rotation" in sd:
            try:
                rot = int(round(float(sd["rotation"])))
            except (TypeError, ValueError):
                pass
    if not rot:
        try:
            rot = int((stream.get("tags") or {}).get("rotate", 0))
        except (TypeError, ValueError):
            rot = 0
    return rot % 360


def clip_info(path: Path) -> dict:
    path = Path(path)
    data = probe(path)
    streams = data.get("streams") or []
    fmt = data.get("format") or {}
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not (s.get("disposition") or {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if video is None:
        raise BCError(f"{path.name} has no video track.")
    rot = _rotation(video)
    w, h = int(video.get("width") or 0), int(video.get("height") or 0)
    if rot in (90, 270):
        w, h = h, w
    sar = video.get("sample_aspect_ratio") or "1:1"
    try:
        num, den = (int(x) for x in sar.split(":"))
        if num > 0 and den > 0 and num != den:
            w = int(round(w * num / den))
    except ValueError:
        pass
    dur = 0.0
    for v in (fmt.get("duration"), video.get("duration")):
        try:
            dur = max(dur, float(v))
        except (TypeError, ValueError):
            pass
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    vtags = {k.lower(): v for k, v in (video.get("tags") or {}).items()}
    created = (tags.get("com.apple.quicktime.creationdate") or tags.get("creation_time")
               or vtags.get("creation_time"))
    trc = (video.get("color_transfer") or "").lower()
    hdr = "hlg" if trc == "arib-std-b67" else "pq" if trc == "smpte2084" else None
    return {
        "file": path.name,
        "path": str(path.resolve()),
        "duration": round(dur, 3),
        "width": w,
        "height": h,
        "rotation": rot,
        "fps": round(_fps(video), 3),
        "has_audio": audio is not None,
        "hdr": hdr,
        "codec": video.get("codec_name"),
        "created": created,
    }


def outputs_of(folder: Path) -> set:
    try:
        return set(read_json(folder / WORK_DIRNAME / "manifest.json").get("outputs", []))
    except BCError:
        return set()


def scan_folder(folder: Path) -> dict:
    folder = Path(folder).expanduser()
    if not folder.exists():
        raise BCError(f"The folder {folder} does not exist.", "Check the name or give the full path of the folder.")
    if not folder.is_dir():
        raise BCError(f"{folder} is a file, not a folder.")
    produced = outputs_of(folder)
    videos, images, audio, skipped = [], [], [], []
    for p in sorted(folder.iterdir(), key=lambda x: natural_key(x.name)):
        if p.name.startswith(".") or not p.is_file() or p.name in produced:
            continue
        ext = p.suffix.lower()
        if ext in VIDEO_EXTS:
            try:
                info = clip_info(p)
                if info["duration"] < 0.3:
                    skipped.append({"file": p.name, "reason": "shorter than 0.3 seconds"})
                else:
                    videos.append(info)
            except BCError as e:
                skipped.append({"file": p.name, "reason": e.message})
        elif ext in IMAGE_EXTS:
            images.append(p.name)
        elif ext in AUDIO_EXTS:
            audio.append(p.name)
    if videos and all(v.get("created") for v in videos):
        videos.sort(key=lambda v: (v["created"], natural_key(v["file"])))
    subfolders = []
    if not videos:
        for d in sorted(folder.iterdir()):
            if d.is_dir() and not d.name.startswith(".") and d.name not in (WORK_DIRNAME, EDITED_DIRNAME):
                n = sum(1 for f in d.iterdir() if f.suffix.lower() in VIDEO_EXTS)
                if n:
                    subfolders.append({"folder": str(d), "videos": n})
    return {"folder": str(folder.resolve()), "videos": videos, "images": images, "audio": audio,
            "skipped": skipped, "subfolders_with_videos": subfolders}


def extract_audio(clip_path: Path, out_wav: Path) -> Optional[Path]:
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    if out_wav.exists() and out_wav.stat().st_size > 1000:
        return out_wav
    run([ffmpeg(), "-v", "error", "-y", "-i", clip_path, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", out_wav], what=f"audio extraction from {Path(clip_path).name}")
    return out_wav


def energy_db(wav: Path, hop: float = 0.01):
    """Loudness (dB) of each 10 ms frame of a 16 kHz mono WAV, as a numpy array."""
    import wave

    import numpy as np
    with wave.open(str(wav)) as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    n = max(1, int(sr * hop))
    frames = len(data) // n
    if frames == 0:
        return np.zeros(1, dtype=np.float32)
    x = data[: frames * n].reshape(frames, n)
    return (20 * np.log10(np.sqrt((x * x).mean(axis=1)) + 1e-6)).astype(np.float32)
