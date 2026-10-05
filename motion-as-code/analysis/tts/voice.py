"""The demo voice, made on your own machine with Qwen3-TTS (Apache 2.0). Optional: any voiceover works
(audio/voiceover.mp3: ElevenLabs, a recording...); this is the free, local way the demo's voice was made.

    cd motion-as-code
    uv run --no-project --with qwen-tts --with soundfile python analysis/tts/voice.py design
    uv run --no-project --with qwen-tts --with soundfile python analysis/tts/voice.py ref --from 48.42 --to 55.98 \
        --text "Poi viene renderizzata fotogramma per fotogramma, e trasformata in un video."
    uv run --no-project --with qwen-tts --with soundfile python analysis/tts/voice.py lines          # or: lines c02,c05 --seed 32
    uv run --no-project --with faster-whisper --with soundfile python analysis/tts/voice.py check
    uv run --no-project --with soundfile --with numpy python analysis/tts/voice.py assemble

1. design   VoiceDesign reads the whole script in one take, in a voice described in words (INSTRUCT).
2. ref      A clean stretch of that take (7-8 s) and the words said in it become the reference voice.
3. lines    The Base model says every line of lines.json in the reference voice, each with its own seed.
            One take per line is steadier than a whole script, and a line that comes out wrong is redone
            alone: try another seed (then write it in lines.json) or another spelling. "tts" in lines.json
            is what the model reads when it differs from the text: "emme ci pi" for MCP, "tre di" for 3D,
            "Clod" so that Claude is not read as "cloud".
4. check    Whisper (large-v3-turbo) transcribes every take and counts the words it did not hear as written.
5. assemble Trims each take's silences, joins them with the pauses in lines.json (the plates cut in those
            pauses), adds a lead-in, normalises, and writes audio/voiceover.mp3. Then re-run the alignment
            (analysis/align_vo.py) and the audio analysis (analysis/audio_vo.py).

Work files go to analysis/tts/work/ (not committed). On a 4-core CPU the 1.7B models take about 5-7 s per
second of speech; the models (a few GB each) are downloaded from Hugging Face on first use.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LINES = os.path.join(HERE, "lines.json")
INSTRUCT = (
    "Voce maschile italiana madrelingua, sui trent'anni, calda e sicura, con un tono leggermente ironico. "
    "Narratore di video tech moderni: dizione chiara, ritmo energico ma naturale, pause brevi tra le frasi, "
    "registrazione da studio pulita. I termini inglesi come motion graphics, After Effects, prompt, render e keyframe "
    "sono pronunciati in inglese."
)
LEAD = 0.30  # silence before the first line (s)


def load_lines():
    return json.load(open(LINES, encoding="utf-8"))


def take(work, line, seed=None):
    return os.path.join(work, "lines", f"{line['id']}_s{seed if seed is not None else line['seed']}.wav")


def model(name):
    import torch
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(os.cpu_count() or 4)
    cuda = torch.cuda.is_available()
    return Qwen3TTSModel.from_pretrained(f"Qwen/Qwen3-TTS-12Hz-1.7B-{name}", device_map="cuda:0" if cuda else "cpu",
                                         dtype=torch.bfloat16 if cuda else torch.float32)


def design(a):
    import soundfile as sf
    import torch

    m = model("VoiceDesign")
    text = " ".join(l.get("tts", l["text"]) for l in load_lines())
    torch.manual_seed(a.seed)
    t0 = time.time()
    wavs, sr = m.generate_voice_design(text=text, instruct=a.instruct, language="Italian", max_new_tokens=4096)
    out = os.path.join(a.work, f"design_s{a.seed}.wav")
    sf.write(out, wavs[0], sr)
    print(f"{os.path.relpath(out, ROOT)}: {len(wavs[0]) / sr:.1f} s of speech in {time.time() - t0:.0f} s")
    print("Listen to it and pick 7-8 clean seconds for the next step (ref --from --to --text).")


def ref(a):
    import soundfile as sf

    src = a.take or max(glob.glob(os.path.join(a.work, "design_s*.wav")), key=os.path.getmtime)
    x, sr = sf.read(src, dtype="float32")
    seg = x[int(a.start * sr):int(a.end * sr)]
    sf.write(os.path.join(a.work, "ref.wav"), seg, sr)
    open(os.path.join(a.work, "ref.txt"), "w", encoding="utf-8").write(a.text.strip() + "\n")
    print(f"reference: {len(seg) / sr:.2f} s of {os.path.relpath(src, ROOT)} -> work/ref.wav, work/ref.txt")


def lines(a):
    import soundfile as sf
    import torch

    want = set(a.ids.split(",")) if a.ids else None
    todo = [l for l in load_lines() if not want or l["id"] in want]
    m = model("Base")
    prompt = m.create_voice_clone_prompt(ref_audio=os.path.join(a.work, "ref.wav"),
                                         ref_text=open(os.path.join(a.work, "ref.txt"), encoding="utf-8").read().strip(),
                                         x_vector_only_mode=False)
    os.makedirs(os.path.join(a.work, "lines"), exist_ok=True)
    for l in todo:
        seed = a.seed if a.seed is not None else l["seed"]
        torch.manual_seed(seed)
        t0 = time.time()
        wavs, sr = m.generate_voice_clone(text=l.get("tts", l["text"]), language="Italian", voice_clone_prompt=prompt, max_new_tokens=1600)
        sf.write(take(a.work, l, seed), wavs[0], sr)
        print(f"{l['id']} seed {seed}: {len(wavs[0]) / sr:.2f} s in {time.time() - t0:.0f} s", flush=True)


def words(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", s).split()


def check(a):
    import difflib

    import soundfile as sf
    from faster_whisper import WhisperModel

    w = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    want = set(a.ids.split(",")) if a.ids else None
    for l in load_lines():
        f = take(a.work, l, a.seed)
        if (want and l["id"] not in want) or not os.path.exists(f):
            continue
        segs, _ = w.transcribe(f, language="it", beam_size=5)
        heard = " ".join(s.text.strip() for s in segs)
        sm = difflib.SequenceMatcher(None, words(l["text"]), words(heard))
        miss = sum(max(i2 - i1, j2 - j1) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal")
        print(f"{os.path.basename(f):14s} {sf.info(f).duration:5.2f} s  {miss} off  | {heard}", flush=True)
    print("(numbers come back as digits: \"15\" for \"quindici\" is not a mistake)")


def trim(x, sr, thr_db=-30.0, pad=0.06):
    """A take without the silence before and after it (10 ms frames over thr_db below its loudest)."""
    import numpy as np

    h = int(0.01 * sr)
    n = len(x) // h
    db = 20 * np.log10(np.sqrt((x[: n * h].reshape(n, h) ** 2).mean(axis=1) + 1e-12) + 1e-9)
    on = np.where(db > db.max() + thr_db)[0]
    return x[max(0, on[0] * h - int(pad * sr)):min(len(x), (on[-1] + 1) * h + int(pad * sr))]


def assemble(a):
    import numpy as np
    import soundfile as sf

    parts, sr = [], None
    for l in load_lines():
        x, r = sf.read(take(a.work, l), dtype="float32")
        if sr is None:
            sr = r
            parts.append(np.zeros(int(LEAD * sr), np.float32))
        assert r == sr, f"{l['id']}: {r} Hz, the others {sr} Hz"
        x = trim(x.mean(axis=1) if x.ndim > 1 else x, sr)
        fade = int(0.005 * sr)
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
        parts += [x, np.zeros(int(l["pause"] * sr), np.float32)]
    y = np.concatenate(parts)
    # loudness: the voiced parts (50 ms blocks) to about -19 dBFS RMS, peaks under -1 dBFS
    h = int(0.05 * sr)
    n = len(y) // h
    r = np.sqrt((y[: n * h].reshape(n, h) ** 2).mean(axis=1))
    act = r[r > r.max() * 0.1]
    g = min(10 ** (-19 / 20) / np.sqrt((act ** 2).mean()), 10 ** (-1 / 20) / np.abs(y).max())
    wav = os.path.join(a.work, "voiceover.wav")
    sf.write(wav, (y * g).astype(np.float32), sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ar", "44100", "-ac", "1", "-b:a", "192k", a.out], check=True)
    print(f"{os.path.relpath(a.out, ROOT)}: {len(y) / sr:.2f} s, gain {20 * np.log10(g):+.1f} dB")
    print("Now re-run analysis/align_vo.py and analysis/audio_vo.py.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default=os.path.join(HERE, "work"), help="work folder (default analysis/tts/work)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("design", help="the whole script in one take, in a voice described in words")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--instruct", default=INSTRUCT, help="the voice, described in words")
    p.set_defaults(fn=design)
    p = sub.add_parser("ref", help="cut the reference voice out of the design take")
    p.add_argument("--take", help="default: the latest work/design_s*.wav")
    p.add_argument("--from", dest="start", type=float, required=True)
    p.add_argument("--to", dest="end", type=float, required=True)
    p.add_argument("--text", required=True, help="the words said in that stretch, exactly")
    p.set_defaults(fn=ref)
    for name, fn, hlp in (("lines", lines, "say the lines in the reference voice"), ("check", check, "transcribe the takes with Whisper")):
        p = sub.add_parser(name, help=hlp)
        p.add_argument("ids", nargs="?", help="comma-separated line ids (default: all)")
        p.add_argument("--seed", type=int, help="instead of each line's seed in lines.json")
        p.set_defaults(fn=fn)
    p = sub.add_parser("assemble", help="join the takes into audio/voiceover.mp3")
    p.add_argument("--out", default=os.path.join(ROOT, "audio", "voiceover.mp3"))
    p.set_defaults(fn=assemble)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    a.fn(a)


if __name__ == "__main__":
    main()
