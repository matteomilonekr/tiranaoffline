"""A short sample video + contact sheet that shows how a brand's captions and titles look."""
from __future__ import annotations

import shutil
from pathlib import Path

from .common import HOME, WORK_DIRNAME, BCError, ffmpeg, run, write_json
from .plan import write_plan

PHRASES = {
    "it": ["Ecco come appaiono i tuoi video.", "Sottotitoli con le parole evidenziate.", "Tutto nel tuo stile."],
    "en": ["This is how your videos look.", "Captions with highlighted words.", "All in your brand style."],
    "nl": ["Zo zien je video's eruit.", "Ondertitels met gemarkeerde woorden.", "Helemaal in jouw stijl."],
    "de": ["So sehen deine Videos aus.", "Untertitel mit hervorgehobenen Wörtern.", "Alles in deinem Stil."],
    "fr": ["Voici à quoi ressemblent tes vidéos.", "Des sous-titres avec des mots en couleur.", "Tout à ton image."],
    "es": ["Así se ven tus vídeos.", "Subtítulos con palabras destacadas.", "Todo con tu estilo."],
}
WORDS = {"it": ("Il tuo brand", "ogni video", "1 clic.", "nuovo"), "en": ("Your brand", "every video", "1 click.", "new"),
         "nl": ("Jouw merk", "elke video", "1 klik.", "nieuw"), "de": ("Deine Marke", "jedes Video", "1 Klick.", "neu"),
         "fr": ("Ta marque", "chaque vidéo", "1 clic.", "nouveau"), "es": ("Tu marca", "cada vídeo", "1 clic.", "nuevo")}


def make_sample(brand: dict) -> Path:
    from .render import render_plan
    lang = (brand.get("language") or "en")[:2].lower()
    lang = lang if lang in PHRASES else "en"
    folder = HOME / "samples" / brand.get("slug", "default")
    if folder.exists():
        shutil.rmtree(folder)
    work = folder / WORK_DIRNAME
    (work / "transcripts").mkdir(parents=True, exist_ok=True)
    clip = folder / "sample.mp4"
    dur = 9.0
    try:
        run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i",
             f"gradients=s=1080x1920:c0=0x3d4a57:c1=0xa08f7c:c2=0x5f6f63:nb_colors=3:speed=0.02:d={dur}:r=30",
             "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", clip],
            what="the sample background")
    except BCError:
        run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x5d6772:s=1080x1920:d={dur}:r=30",
             "-vf", "noise=alls=10:allf=t,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", clip],
            what="the sample background")
    words, sents = [], []
    t = 0.4
    for s in PHRASES[lang]:
        w0 = len(words)
        for w in s.split():
            d = 0.12 + 0.045 * len(w)
            words.append({"w": w, "s": round(t, 3), "e": round(t + d, 3), "p": 1.0})
            t += d + 0.06
        sents.append({"start": words[w0]["s"], "end": words[-1]["e"], "w0": w0, "w1": len(words),
                      "text": s})
        t += 0.5
    write_json(work / "transcripts" / "sample.mp4.json",
               {"file": "sample.mp4", "key": "sample", "language": lang, "duration": dur, "words": words,
                "sentences": sents})
    b, v, punch, new = WORDS[lang]
    marked = [s for s in PHRASES[lang]]
    ws = marked[1].split()
    longest = max(range(len(ws)), key=lambda i: len(ws[i].strip(".,!?")))
    marked[1] = " ".join(f"*{w}*" if i == longest else w for i, w in enumerate(ws))
    plan = {
        "version": 1, "name": "sample", "folder": str(folder), "output": "sample-edit.mp4",
        "brand": brand.get("slug", "default"), "format": "9:16",
        "settings": {"cut": "none", "zoom_cuts": False, "captions": True, "preset": "veryfast", "crf": 23},
        "clips": [{"id": "c1", "file": "sample.mp4", "kind": "visual", "duration": dur, "trim": [0, dur],
                   "sentences": [{"id": f"c1.s{i + 1}", "text": s, "keep": True} for i, s in enumerate(marked)]}],
        "overlays": [
            {"type": "hook", "text": f"{b},\n*{v}*", "at": 0.0, "duration": 1.6, "hide_captions": True},
            {"type": "punch", "text": punch, "at": "c1.s2", "duration": 1.1},
            {"type": "label", "text": new, "at": "c1.s3", "duration": 1.6},
            {"type": "title", "text": f"{brand.get('name', 'Brand')} · *{v}*", "from": "c1.s3", "to": "end"},
        ],
    }
    if (brand.get("endcard") or {}).get("enabled"):
        plan["overlays"].append({"type": "endcard", "duration": 2.6})
    write_plan(work / "plan.json", plan)
    summary = render_plan(work / "plan.json")
    if not summary.get("preview"):
        raise BCError("The sample preview could not be created.")
    # keep only the picture, next to the brand profile; the sample video is not needed
    dest = (Path(brand["_dir"]) if brand.get("_dir") else HOME) / "sample.jpg"
    shutil.copy2(summary["preview"], dest)
    shutil.rmtree(folder, ignore_errors=True)
    return dest
