"""One-time setup for align_vo.py: export the Italian CTC acoustic model to ONNX and quantize it.

    uv run --no-project --with torch --with transformers --with onnx --with onnxruntime \
        python analysis/export_model.py

Downloads jonatasgrosman/wav2vec2-large-xlsr-53-italian (Apache-2.0, ~1.3 GB of PyTorch weights) from
Hugging Face, exports it to ONNX (dynamic length) and quantizes the weights to int8, which leaves
analysis/models/wav2vec2-it-int8.onnx (~320 MB) and analysis/models/vocab.json. Everything else in the
pipeline then needs only onnxruntime and numpy. The models/ folder is git-ignored.

For an English voiceover pass --model facebook/wav2vec2-base-960h (Apache-2.0, ~95 MB once quantized)
and --name wav2vec2-en-int8, then run align_vo.py with --model analysis/models/wav2vec2-en-int8.onnx.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="jonatasgrosman/wav2vec2-large-xlsr-53-italian")
    ap.add_argument("--name", default="wav2vec2-it-int8")
    ap.add_argument("--out", default=os.path.join(HERE, "models"))
    a = ap.parse_args()

    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    from onnxruntime.quantization import QuantType, quantize_dynamic

    os.makedirs(a.out, exist_ok=True)
    print(f"downloading {a.model} ...", flush=True)
    proc = Wav2Vec2Processor.from_pretrained(a.model)
    model = Wav2Vec2ForCTC.from_pretrained(a.model).eval()

    # vocab: id -> token, plus the blank (pad) id and the word delimiter
    vocab = proc.tokenizer.get_vocab()
    meta = {
        "source": a.model,
        "vocab": {k: int(v) for k, v in vocab.items()},
        "blank": int(proc.tokenizer.pad_token_id),
        "delimiter": proc.tokenizer.word_delimiter_token,
        "sample_rate": int(proc.feature_extractor.sampling_rate),
        "normalize": bool(getattr(proc.feature_extractor, "do_normalize", True)),
        # wav2vec2 emits one frame per 320 samples (20 ms at 16 kHz)
        "hop": 320,
    }

    class Logits(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, x):
            return torch.log_softmax(self.m(x).logits, dim=-1)

    fp32 = os.path.join(a.out, f"{a.name}.fp32.onnx")
    x = torch.zeros(1, 16000 * 4)
    print("exporting to ONNX ...", flush=True)
    torch.onnx.export(
        Logits(model), (x,), fp32, input_names=["audio"], output_names=["logprobs"],
        dynamic_axes={"audio": {1: "samples"}, "logprobs": {1: "frames"}}, opset_version=17, dynamo=False,
    )
    out = os.path.join(a.out, f"{a.name}.onnx")
    print("quantizing to int8 ...", flush=True)
    quantize_dynamic(fp32, out, weight_type=QuantType.QInt8)
    os.remove(fp32)
    for f in os.listdir(a.out):  # external-data leftovers of the fp32 export
        if f.endswith(".onnx.data") or f.startswith(f"{a.name}.fp32"):
            os.remove(os.path.join(a.out, f))
    with open(os.path.join(a.out, f"{a.name}.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.0f} MB)")


if __name__ == "__main__":
    sys.exit(main())
