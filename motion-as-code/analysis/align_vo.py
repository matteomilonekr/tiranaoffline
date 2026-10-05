"""Word-level timings of the voiceover -> data/lyrics.json.

    uv run --no-project --with onnxruntime --with numpy python analysis/align_vo.py

CTC forced alignment: a wav2vec2 acoustic model (quantized ONNX, made once by export_model.py) gives
per-frame letter probabilities (one frame every 20 ms); a Viterbi pass forces SCRIPT's letters through
them in order, which gives every word a start and an end. The boundaries are then refined against the
audio's silences: a word that starts in a pause moves to where the voice comes back, a word that runs
on into a pause ends where the voice stops.

To use another read or another script: replace audio/voiceover.mp3, edit SCRIPT below (one entry per
line of the read; the plates find lines and words by content, so keep the phrases they look up, or
update them, see timeline.ts) and SPOKEN (how numbers, acronyms and English words are pronounced),
then run this script and audio_vo.py again.
"""
import argparse
import json
import os
import subprocess
import sys
import unicodedata

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# The read, one entry per line. Display text: punctuation, quotes and capitals show up in the video
# exactly as written here. Lines are the units the timeline cuts on (timeline.ts, cut()).
SCRIPT = [
    "E se ti dicessi che puoi creare motion graphics come questa senza nemmeno aprire After Effects?",
    "E no, non è un MCP per After Effects.",
    "Questo è Claude Code.",
    "Invece di controllare After Effects, gli descrivi semplicemente quello che vuoi.",
    "Per esempio:",
    "“Crea una sequenza cinematografica di quindici secondi, con tipografia cinetica, transizioni fluide tra le forme, elementi 3D e movimenti di camera continui.”",
    "Ed è qui che diventa folle:",
    "non genera direttamente un MP4.",
    "Scrive l’animazione stessa, come codice.",
    "Ogni forma, ogni parola, ogni movimento di camera è definito matematicamente nel tempo.",
    "Poi viene renderizzata fotogramma per fotogramma, e trasformata in un video.",
    "Il vecchio flusso: After Effects, livelli, keyframe, curve.",
    "Il nuovo: prompt, codice, render, video.",
    "E siccome è tutto procedurale, ogni modifica è una frase.",
    "Rallenta la transizione.",
    "Cambia il colore.",
    "Aggiungi una scena.",
    "Renderizza di nuovo.",
    "Quattro comandi, invece di centinaia di keyframe da spostare a mano.",
    "Quindi: sostituisce After Effects?",
    "Non proprio.",
    "Ma farlo partendo da un prompt… è pazzesco.",
]

# How a written word is pronounced, spelled for the acoustic model (Italian letters). Keys are matched
# case-insensitively against the word without its punctuation. Numbers, acronyms and English words
# read the English way belong here; anything else is aligned as written.
SPOKEN = {
    "mcp": "emme ci pi",
    "mp4": "emme pi quattro",
    "3d": "tre di",
    "motion": "mosciom",
    "graphics": "grafics",
    "after": "after",
    "effects": "efects",
    "claude": "clod",
    "code": "coud",
    "keyframe": "chifreim",
    "prompt": "prompt",
    "render": "render",
}

FRAME = 0.02  # s per acoustic-model frame (320 samples at 16 kHz)


def load_audio(path, sr=16000):
    """Decode any audio file to mono float32 at `sr` through ffmpeg."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def fold(s):
    """Lowercase without punctuation; letters keep their accents."""
    s = unicodedata.normalize("NFC", s.lower()).replace("’", "'")
    return "".join(ch for ch in s if ch.isalnum() or ch == "'").strip("'")


def tokens_for(word, vocab):
    """Letters of a word as model token ids (via SPOKEN), dropping what the vocabulary lacks."""
    key = fold(word)
    spoken = SPOKEN.get(key, key)
    ids = []
    for part in spoken.split():
        for ch in part:
            if ch in vocab:
                ids.append(vocab[ch])
            else:  # an accent the model lacks: try the bare letter
                base = unicodedata.normalize("NFD", ch)[0]
                if base in vocab:
                    ids.append(vocab[base])
    return ids


def logprobs(audio, sess, normalize, sr=16000, win=20.0, ctx=1.0):
    """Per-frame log-probabilities over the vocabulary, computed in overlapping windows."""
    if normalize:
        audio = (audio - audio.mean()) / (audio.std() + 1e-7)
    n = len(audio)
    hop = int((win - 2 * ctx) * sr)
    outs = []
    start = 0
    nframes = int(np.ceil(n / (FRAME * sr)))
    while start < n:
        a0 = max(0, start - int(ctx * sr))
        a1 = min(n, start + hop + int(ctx * sr))
        lp = sess.run(None, {"audio": audio[None, a0:a1].astype(np.float32)})[0][0]
        f_off = int(round((start - a0) / sr / FRAME))
        f_len = int(round(min(hop, n - start) / sr / FRAME))
        outs.append(lp[f_off:f_off + f_len])
        start += hop
    out = np.concatenate(outs, axis=0)
    if len(out) < nframes:  # rounding at the end: repeat the last frame
        out = np.concatenate([out, np.repeat(out[-1:], nframes - len(out), axis=0)])
    return out[:nframes]


def force_align(lp, tokens, blank):
    """CTC Viterbi: frame index where each token is first emitted, and its last frame."""
    T, S = lp.shape[0], 2 * len(tokens) + 1
    ext = np.full(S, blank)
    ext[1::2] = tokens
    NEG = -1e9
    dp = np.full(S, NEG)
    dp[0] = lp[0, blank]
    if S > 1:
        dp[1] = lp[0, ext[1]]
    back = np.zeros((T, S), dtype=np.int8)  # 0 stay, 1 from s-1, 2 from s-2
    skip_ok = np.zeros(S, dtype=bool)
    skip_ok[3::2] = ext[3::2] != ext[1:-2:2]
    for t in range(1, T):
        stay = dp
        prev1 = np.concatenate([[NEG], dp[:-1]])
        prev2 = np.where(skip_ok, np.concatenate([[NEG, NEG], dp[:-2]]), NEG)
        best = np.maximum(stay, np.maximum(prev1, prev2))
        back[t] = np.where(best == stay, 0, np.where(best == prev1, 1, 2))
        dp = best + lp[t, ext]
    s = S - 1 if S == 1 or dp[S - 1] >= dp[S - 2] else S - 2
    path = np.zeros(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    # token k (state 2k+1): first and last frame where the path sits on it
    first = np.full(len(tokens), -1)
    last = np.full(len(tokens), -1)
    for t, st in enumerate(path):
        if st % 2 == 1:
            k = st // 2
            if first[k] < 0:
                first[k] = t
            last[k] = t
    score = np.array([lp[t, ext[st]] for t, st in enumerate(path)])
    return first, last, path, score


def envelope(audio, sr=16000, hop=0.01):
    """RMS envelope in dB, one value per `hop` seconds."""
    h = int(hop * sr)
    n = len(audio) // h
    x = audio[: n * h].reshape(n, h)
    rms = np.sqrt((x.astype(np.float64) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def refine(words, env, hop=0.01, floor_db=None):
    """Snap word edges to the voice: starts out of pauses, ends at the end of the sound."""
    db = env
    if floor_db is None:
        loud = np.percentile(db, 95)
        floor_db = max(np.percentile(db, 10) + 12, loud - 38)
    voiced = db > floor_db
    n = len(db)

    def idx(t):
        return int(np.clip(round(t / hop), 0, n - 1))

    for i, w in enumerate(words):
        # start: if it sits in silence, move forward to the first voiced frame (at most 0.25 s);
        # if voice runs before it (CTC places starts late), move back while voiced, at most 60 ms
        s = idx(w["start"])
        if not voiced[s]:
            j = s
            while j < min(n - 1, s + 25) and not voiced[j]:
                j += 1
            if voiced[j]:
                s = j
        else:
            j = s
            lim = max(0, s - 6)
            prev_end = idx(words[i - 1]["end"]) if i > 0 else 0
            while j > max(lim, prev_end) and voiced[j - 1]:
                j -= 1
            s = j
        w["start"] = round(s * hop, 3)
    for i, w in enumerate(words):
        nxt = words[i + 1]["start"] if i + 1 < len(words) else n * hop
        e = idx(w["end"])
        # run on while voiced (CTC ends early: the last letter is one frame), up to the next word
        j = e
        stop = idx(nxt)
        while j < stop and voiced[j]:
            j += 1
        e = max(e, j)
        e = min(e, stop)
        w["end"] = round(max(e * hop, min(w["start"] + 0.06, nxt)), 3)
    return words


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio", default=os.path.join(ROOT, "audio", "voiceover.mp3"))
    ap.add_argument("--model", default=os.path.join(HERE, "models", "wav2vec2-it-int8.onnx"))
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "lyrics.json"))
    a = ap.parse_args()

    if not os.path.exists(a.model):
        sys.exit(
            f"acoustic model not found: {a.model}\n"
            "make it once with:\n"
            "  uv run --no-project --with torch --with transformers --with onnx --with onnxruntime "
            "python analysis/export_model.py"
        )
    import onnxruntime as ort

    meta = json.load(open(a.model[: -len(".onnx")] + ".json", encoding="utf-8"))
    vocab = {k.lower(): v for k, v in meta["vocab"].items() if len(k) == 1 and k != meta["delimiter"]}
    blank = meta["blank"]

    audio = load_audio(a.audio)
    dur = len(audio) / 16000
    print(f"audio {dur:.2f}s, aligning {sum(len(l.split()) for l in SCRIPT)} words ...", flush=True)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = os.cpu_count() or 4
    sess = ort.InferenceSession(a.model, opts, providers=["CPUExecutionProvider"])
    lp = logprobs(audio, sess, meta.get("normalize", True))

    # token sequence: every word's letters, with the model's word delimiter between words;
    # word w owns tokens [k0, k1)
    delim = meta["vocab"].get(meta["delimiter"])
    words, tokens, own = [], [], []
    for li, line in enumerate(SCRIPT):
        for disp in line.split():
            ids = tokens_for(disp, vocab)
            if not ids:
                raise SystemExit(f"no alignable letters in {disp!r}: add it to SPOKEN")
            if tokens and delim is not None:
                tokens.append(delim)
            own.append((len(tokens), len(tokens) + len(ids)))
            tokens.extend(ids)
            words.append({"w": disp, "line": li})
    first, last, path, score = force_align(lp, np.array(tokens), blank)
    for w, (k0, k1) in zip(words, own):
        f0, f1 = first[k0], last[k1 - 1]
        w["start"] = round(f0 * FRAME, 3)
        w["end"] = round((f1 + 1) * FRAME, 3)
        frames = [t for t in range(f0, f1 + 1)]
        w["conf"] = round(float(np.exp(np.mean(score[frames]))) if frames else 0.0, 3)

    words = refine(words, envelope(audio))

    lines = []
    for li, text in enumerate(SCRIPT):
        ws = [w for w in words if w["line"] == li]
        lines.append({
            "text": text,
            "start": ws[0]["start"],
            "end": ws[-1]["end"],
            "words": [{"w": w["w"], "start": w["start"], "end": w["end"], "conf": w["conf"]} for w in ws],
        })
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"source": os.path.relpath(a.audio, ROOT), "duration": round(dur, 3), "lines": lines}, f, ensure_ascii=False, indent=1)
    low = [w for w in words if w["conf"] < 0.2]
    for l in lines:
        print(f"{l['start']:7.2f} {l['end']:7.2f}  {l['text']}")
    if low:
        print("low-confidence words (check SPOKEN / the read):", ", ".join(f"{w['w']}@{w['start']:.2f}" for w in low))
    print(f"wrote {os.path.relpath(a.out, ROOT)}")


if __name__ == "__main__":
    main()
