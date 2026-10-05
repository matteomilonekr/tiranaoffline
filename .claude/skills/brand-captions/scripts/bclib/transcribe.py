"""Speech-to-text with word timings (faster-whisper, runs locally)."""
from __future__ import annotations

import os
import re
import time
from collections import Counter
from pathlib import Path
from typing import Optional

from .common import MODELS_DIR, BCError, file_key, load_config, read_json, say, write_json
from .media import extract_audio

DEFAULT_MODEL = "large-v3-turbo"

# Phrases Whisper invents on silence or music (subtitle credits etc.).
HALLUCINATIONS = [
    "amara.org", "sottotitoli creati dalla comunità", "sottotitoli a cura di", "qtss",
    "thanks for watching", "thank you for watching", "please subscribe", "grazie per la visione",
    "grazie a tutti per la visione", "untertitel im auftrag", "untertitel der", "ondertiteling",
    "ondertiteld door", "sous-titres réalisés", "sous-titrage", "subtítulos realizados", "subtitles by",
]

_END = re.compile(r"[.!?…]['\"»”’)]*$")
_SOFT = re.compile(r"[,;:–—]['\"»”’)]*$")


def model_name() -> str:
    return os.environ.get("BRAND_CAPTIONS_MODEL") or load_config().get("whisper_model") or DEFAULT_MODEL


class Transcriber:
    def __init__(self, name: Optional[str] = None):
        self.name = name or model_name()
        self._model = None

    def model(self):
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
                import ctranslate2
            except ImportError:
                raise BCError("The speech recognition package is not installed yet.",
                              "Run: bc.py doctor --install")
            device, compute = "cpu", "int8"
            try:
                if ctranslate2.get_cuda_device_count() > 0:
                    device, compute = "cuda", "float16"
            except Exception:
                pass
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            say(f"• Loading the speech model ({self.name}). The first time it downloads once, this can take a few minutes.")
            try:
                self._model = WhisperModel(self.name, device=device, compute_type=compute,
                                           download_root=str(MODELS_DIR),
                                           cpu_threads=min(8, os.cpu_count() or 4))
            except Exception as e:  # network or disk problems while downloading
                raise BCError("The speech model could not be loaded or downloaded.",
                              "Check the internet connection and free disk space (about 2 GB), then try again.",
                              detail=str(e)[-600:])
        return self._model

    def transcribe(self, wav: Path, duration: float, language: Optional[str], prompt: Optional[str],
                   label: str) -> dict:
        model = self.model()
        t0 = time.time()
        segments, info = model.transcribe(
            str(wav), language=language or None, word_timestamps=True, beam_size=5,
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 700, "speech_pad_ms": 300},
            condition_on_previous_text=False, initial_prompt=prompt or None)
        words, last_report = [], 0.0
        for seg in segments:
            text = (seg.text or "").strip().lower()
            if any(h in text for h in HALLUCINATIONS):
                continue
            if seg.no_speech_prob > 0.75 and seg.avg_logprob < -0.9:
                continue
            for w in seg.words or []:
                t = (w.word or "").strip()
                if not t:
                    continue
                words.append({"w": t, "s": round(float(w.start), 3), "e": round(float(w.end), 3),
                              "p": round(float(w.probability), 3)})
            if duration > 30 and seg.end - last_report > duration / 4:
                last_report = seg.end
                say(f"  … {label}: {int(100 * seg.end / duration)}%")
        _fix_times(words, duration)
        say(f"  ✓ {label}: {len(words)} words ({time.time() - t0:.0f}s)")
        return {"language": info.language, "language_probability": round(float(info.language_probability), 3),
                "words": words}


def _fix_times(words: list, duration: float) -> None:
    prev_s = 0.0
    for w in words:
        w["s"] = max(prev_s, min(w["s"], duration))
        w["e"] = min(max(w["e"], w["s"] + 0.05), duration if duration > w["s"] else w["s"] + 0.05)
        prev_s = w["s"]


def split_sentences(words: list, max_words: int = 18) -> list:
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = (nxt["s"] - w["e"]) if nxt else 0.0
        if (nxt is None or _END.search(w["w"]) or gap > 1.0
                or (len(cur) >= max_words and (_SOFT.search(w["w"]) or gap > 0.35)) or len(cur) >= 28):
            sents.append(cur)
            cur = []
    out = []
    for c in sents:
        out.append({"start": words[c[0]]["s"], "end": words[c[-1]]["e"], "w0": c[0], "w1": c[-1] + 1,
                    "text": " ".join(words[i]["w"] for i in c)})
    return out


def transcribe_clips(clips: list, work: Path, language: Optional[str] = None, vocabulary: Optional[list] = None,
                     transcriber: Optional[Transcriber] = None, hint: Optional[str] = None) -> dict:
    """Transcribe each clip (cached). Returns {file name: transcript dict}.

    language forces one language for every clip; otherwise it is detected per clip, and clips where the
    detection is unsure are redone in the language most other clips use (or the brand language `hint`).
    """
    tr = transcriber or Transcriber()
    prompt = (", ".join(vocabulary) + ".") if vocabulary else None
    out, fresh = {}, []

    def run_one(clip, lang):
        path = Path(clip["path"])
        base = {"file": clip["file"], "key": file_key(path, tr.name, language or "", prompt or ""),
                "model": tr.name, "duration": clip["duration"]}
        if not clip.get("has_audio"):
            return dict(base, language=None, language_probability=0.0, words=[], sentences=[])
        wav = extract_audio(path, work / "audio" / f"{clip['file']}.wav")
        data = dict(base, **tr.transcribe(wav, clip["duration"], lang, prompt, clip["file"]))
        data["sentences"] = split_sentences(data["words"])
        return data

    for clip in clips:
        dest = work / "transcripts" / f"{clip['file']}.json"
        key = file_key(Path(clip["path"]), tr.name, language or "", prompt or "")
        if dest.exists():
            try:
                cached = read_json(dest)
                if cached.get("key") == key:
                    out[clip["file"]] = cached
                    continue
            except BCError:
                pass
        out[clip["file"]] = run_one(clip, language)
        fresh.append(clip)
    if not language:
        # one project = usually one language: short or unsure clips follow the main language
        weight = Counter()
        for t in out.values():
            if t.get("language") and t.get("words"):
                weight[t["language"]] += len(t["words"])
        total = sum(weight.values())
        target = None
        if total:
            lang, n = weight.most_common(1)[0]
            if n / total >= 0.6:
                target = lang
        target = target or hint
        for clip in fresh:
            t = out[clip["file"]]
            if not (target and t.get("words") and t.get("language") and t["language"] != target):
                continue
            if t.get("language_probability", 1.0) < 0.9 or clip["duration"] < 6:
                say(f"  … {clip['file']}: language unclear ({t['language']}), listening again as {target}")
                redo = run_one(clip, target)
                redo["key"] = t["key"]
                out[clip["file"]] = redo
    for clip in clips:
        write_json(work / "transcripts" / f"{clip['file']}.json", out[clip["file"]])
    return out
