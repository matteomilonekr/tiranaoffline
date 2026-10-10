"""Generate the still images a film needs, on this machine, and cut them out.

    uv run --no-project --with torch --with diffusers --with transformers --with accelerate \
        --with peft --with "rembg[cpu]" --with pillow \
        python analysis/imagegen.py --film <name> [names...] [--seed N] [--steps 4] [--count 1]

The film lists its images in films/<name>/images.json:

    {"size": 1024,
     "style": "studio product photo, soft light, plain light grey background",
     "items": [{"name": "brain", "prompt": "a pink human brain", "seed": 7, "cutout": true}, ...]}

Each item becomes films/<name>/images/<name>.png, cut out on a transparent background when "cutout"
is true (most are: the film draws its own backgrounds, shadows and light). The raw generations stay in
out/<film>/images/ (with --count N they are numbered, so you can pick a seed and write it in the json).

Model: segmind/SSD-1B (Apache-2.0, a distilled SDXL) with latent-consistency/lcm-lora-ssd-1b
(OpenRAIL++), 4 steps. On a 4-core CPU one 1024 x 1024 image takes about a minute; the first run
downloads ~4.7 GB to the Hugging Face cache. Cutouts: rembg with isnet-general-use (Apache-2.0).
Nothing is sent anywhere: the images are made here, and they are yours to use.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# bfloat16 halves the memory (SSD-1B in float32 does not fit next to a browser in 16 GB); IMAGEGEN_DTYPE=float32 if you have room
DTYPE_NAME = os.environ.get("IMAGEGEN_DTYPE", "bfloat16")
NEGATIVE = "text, letters, logo, watermark, signature, brand, label, blurry, lowres, deformed, cropped"


def load_pipe():
    import torch
    from diffusers import LCMScheduler, StableDiffusionXLPipeline

    torch.set_num_threads(os.cpu_count() or 4)
    DTYPE = getattr(torch, DTYPE_NAME)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "segmind/SSD-1B", variant="fp16", torch_dtype=DTYPE, use_safetensors=True
    )
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.load_lora_weights("latent-consistency/lcm-lora-ssd-1b")
    pipe.fuse_lora()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--film", required=True)
    ap.add_argument("names", nargs="*", help="only these items (default: all)")
    ap.add_argument("--seed", type=int, help="override the item's seed")
    ap.add_argument("--count", type=int, default=1, help="variants per item (seed, seed+1, ...)")
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--guidance", type=float, default=1.5)
    ap.add_argument("--no-cutout", action="store_true")
    a = ap.parse_args()

    film = os.path.join(ROOT, "films", a.film)
    spec = json.load(open(os.path.join(film, "images.json"), encoding="utf-8"))
    items = [i for i in spec["items"] if not a.names or i["name"] in a.names]
    if not items:
        sys.exit("no matching items in images.json")
    size = int(spec.get("size", 1024))
    style = spec.get("style", "")
    raw_dir = os.path.join(ROOT, "out", a.film, "images")
    out_dir = os.path.join(film, "images")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    import torch

    pipe = load_pipe()
    session = None
    for it in items:
        prompt = ", ".join(p for p in (it["prompt"], it.get("style", style)) if p)
        seed0 = a.seed if a.seed is not None else int(it.get("seed", 1))
        for k in range(a.count):
            seed = seed0 + k
            t0 = time.time()
            img = pipe(
                prompt=prompt,
                negative_prompt=it.get("negative", NEGATIVE),
                num_inference_steps=a.steps,
                guidance_scale=a.guidance,
                width=int(it.get("width", size)),
                height=int(it.get("height", size)),
                generator=torch.Generator().manual_seed(seed),
            ).images[0]
            tag = it["name"] if a.count == 1 else f"{it['name']}_{seed}"
            img.save(os.path.join(raw_dir, f"{tag}_raw.png"))
            if it.get("cutout", True) and not a.no_cutout:
                from rembg import new_session, remove

                session = session or new_session("isnet-general-use")
                img = remove(img, session=session)
                bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
                if bbox:
                    pad = 8
                    img = img.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                                    min(img.width, bbox[2] + pad), min(img.height, bbox[3] + pad)))
            mx = int(it.get("max", 900))
            if max(img.size) > mx:
                s = mx / max(img.size)
                img = img.resize((round(img.width * s), round(img.height * s)), 1)
            dest = os.path.join(out_dir if a.count == 1 else raw_dir, f"{tag}.png")
            img.save(dest, optimize=True)
            print(f"{tag:<18} seed {seed:<6} {time.time() - t0:5.1f}s  {os.path.relpath(dest, ROOT)}")


if __name__ == "__main__":
    main()
