"""The transcript an edit cuts on: Whisper (large-v3-turbo) with a time for every word -> JSON.

    uv run --no-project --with faster-whisper python edit/transcribe.py out/refs/call.mp4 out/refs/call.json it

On a 4-core CPU it takes about a third of the video's length. The JSON is what edit/edit.py reads:
{"language", "duration", "segments": [{"start", "end", "text", "words": [{"w", "start", "end", "p"}]}]}.
"""
import json
import sys
import time

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    lang = sys.argv[3] if len(sys.argv) > 3 else None
    t0 = time.time()
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    segs, info = model.transcribe(src, language=lang, beam_size=5, word_timestamps=True, vad_filter=True)
    res = {"language": info.language, "duration": info.duration, "segments": []}
    for s in segs:
        res["segments"].append({"start": s.start, "end": s.end, "text": s.text.strip(),
                                "words": [{"w": w.word.strip(), "start": w.start, "end": w.end, "p": w.probability} for w in s.words]})
        print(f"{s.start:7.2f} {s.end:7.2f} {s.text.strip()}", flush=True)
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{out}: {len(res['segments'])} segments in {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
