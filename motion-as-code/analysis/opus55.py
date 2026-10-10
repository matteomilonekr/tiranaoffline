"""The Opus 5.5 videos list (github.com/yihui-dev/awesome-opus5-5-videos, MIT): 513 viral videos people made by
asking Claude to write the animation as code, each with the prompt its creator shared. This script downloads it,
finds things in it and turns any of its prompts into a brief for this kit.

    python3 analysis/opus55.py fetch                       # -> out/refs/opus55/videos.json
    python3 analysis/opus55.py list [--cat motion] [--tag gsap] [--q logo] [--n 40]
    python3 analysis/opus55.py show <slug>                 # the prompt, its creator, the links
    python3 analysis/opus55.py adapt <slug> [--film name] [--format 9x16|16x9] [--sec 15]   # a brief to paste into Claude Code
    python3 analysis/opus55.py stats                       # categories, techniques, how many prompts ask for each block

The prompts belong to their creators: the list stays in out/ (not in git), and every brief credits its author.
Categories: motion (motion graphics), explainer, 3d, interactive.
"""
import argparse
import collections
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://raw.githubusercontent.com/yihui-dev/awesome-opus5-5-videos/main/data/videos.json"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "out/refs/opus55/videos.json"

# The kit's building blocks (app/src/fx) and the words in a prompt that call for each one.
BLOCKS = {
    "tl": ("timeline, stagger, easing alla GSAP e molle senza rimbalzi", r"\bgsap\b|\btimeline|\bstagger|\beas(e|ing)\b|ease-?(in|out)|cubic-bezier|\bspring|overshoot|bounc"),
    "beat": ("griglia a 120 bpm: tagli e colpi sui battiti", r"\bbpm\b|\bbeats?\b|\bbars?\b|on the beat|to the music|music|soundtrack|rhythm|\bsync"),
    "text": ("testo cinetico: maschere, scramble, macchina da scrivere, contatori", r"kinetic|typograph|letter|split text|scrambl|decod|typewrit|typing|headline|counter|odometer|count(s|ing)? up|\bfont"),
    "path": ("tracciati che si disegnano, morph di forme, glint sul logo", r"\bpaths?\b|stroke|draw[- ]?(on|in)|draws? (itself|in)|line art|morph|outline|signature|handwrit|\blogo"),
    "shared": ("una forma sola che diventa la successiva (mai un taglio)", r"never cut|one shape|single shape|shared element|morphs? into|becomes the|continuous|seamless"),
    "camera": ("camera 2.5D: spinte, zoom tra scale, parallasse, smash-pan", r"camera|parallax|\bzoom|\bdolly|\bpan(s|ning)?\b|2\.5d|fly ?through|push[- ]in|punch[- ]in"),
    "transition": ("transizioni a maschera: iride, tendine, fette, lettere, flash", r"transition|\bwipe|\biris\b|\bmasks?\b|masking|\bslices?\b|shutter|match cut|\bflash"),
    "ui": ("interfacce: finestre, telefono, cursore, toggle, tab, ⌘K, terminale", r"\bui\b|interface|cursor|\bclicks?\b|\bbuttons?\b|\bapp\b|mock-?up|\bscreens?\b|terminal|browser|saas|product|launch"),
    "chart": ("grafici e numeri che si disegnano", r"\bcharts?\b|\bgraphs?\b|bar chart|data ?vi[sz]|statistic|percent|dashboard|metric|\bkpi"),
    "particles": ("particelle che compongono parole, scintille, coriandoli", r"particle|\bdust\b|swarm|confetti|\bsparks?\b|point cloud|starfield|firework"),
    "shader": ("sfondi GLSL: mesh gradient, aurora, caleidoscopio, retino", r"shader|glsl|webgl|gradient mesh|mesh gradient|aurora|\bfluid|liquid|kaleido|fractal|halftone|plasma|\bgrain"),
}
# What a brief warns about: brands, characters and real people the kit must not imitate.
CARE = r"\blogo of\b|real assets|actual assets|\bbrand\b|pok[eé]mon|anime|disney|marvel|apple|spotify|chatgpt|openai|grok|slack|google|twitter|\bx\.com|linkedin|tesla|audi|nike|imitat|in the style of|sam altman|dario|elon|\bceo\b|celebrit|\bmeme\b"



def load():
    if not CACHE.exists():
        sys.exit("no list yet: run `python3 analysis/opus55.py fetch` first")
    return json.loads(CACHE.read_text())


def fetch(_):
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    data = json.load(urllib.request.urlopen(URL, timeout=60))
    CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    c = collections.Counter(v["category"] for v in data)
    print(f"{len(data)} videos -> {CACHE.relative_to(ROOT)}  ({', '.join(f'{k} {n}' for k, n in c.most_common())})")


def blocks_of(v):
    p = (v.get("prompt") or "").lower() + " " + " ".join(v.get("tech_tags", []))
    return [k for k, (_, rx) in BLOCKS.items() if re.search(rx, p)]


def pick(data, a):
    out = data
    if a.cat:
        out = [v for v in out if v["category"] == a.cat]
    if a.tag:
        out = [v for v in out if a.tag in v.get("tech_tags", [])]
    if a.q:
        q = a.q.lower()
        out = [v for v in out if q in (v.get("prompt") or "").lower()]
    return out


def ls(a):
    rows = pick(load(), a)
    for v in rows[: a.n]:
        p = re.sub(r"\s+", " ", v.get("prompt") or "")
        print(f"{v['slug']:<28} {v['category']:<11} {','.join(v['tech_tags']):<22} {p[:70]}")
    print(f"-- {min(len(rows), a.n)} of {len(rows)}")


def find(slug):
    for v in load():
        if v["slug"] == slug:
            return v
    sys.exit(f"no such slug: {slug}")


def show(a):
    v = find(a.slug)
    print(f"@{v['author']} · {v['category']} · {', '.join(v['tech_tags'])}")
    print(f"original: {v['post_url']}\nremake:   {v['skillry_url']}")
    if v.get("prompt_partial"):
        print("(the creator shared only part of the prompt, or only described the result)")
    print(f"blocks:   {', '.join(blocks_of(v)) or '-'}\n")
    print(v.get("prompt") or "(no prompt)")


def adapt(a):
    v = find(a.slug)
    film = a.film or re.sub(r"[^a-z0-9]+", "", v["slug"].split("-")[0])[:12] or "remake"
    blocks = blocks_of(v)
    lines = [
        f"Rifai come film di questo kit il video di @{v['author']} dalla lista Opus 5.5 ({v['post_url']}).",
        "",
        f"Il prompt del creator (suo, citalo nei crediti{'; è parziale' if v.get('prompt_partial') else ''}):",
        '"""',
        (v.get("prompt") or "").strip(),
        '"""',
        "",
        "Come farlo qui:",
        f"- Crea films/{film}/ come gli altri film (film.json con format {a.format}, fps 30; timeline.ts con una tavola sola in scenes/{film}.ts).",
        f"- Durata: circa {a.sec} secondi. Ogni fotogramma è una funzione pura del tempo t: niente Math.random(), niente stato tra un fotogramma e l'altro, niente requestAnimationFrame. Usa hash() e noise*() di engine/util.",
        "- Disegna in Canvas2D su un Layer2D e passa dal compositor; per gli sfondi in GLSL usa FSPass. Bloom, grana, vignettatura e aberrazione si chiedono con i PostOverrides di render().",
        "- Usa i blocchi di app/src/fx (import da '@kit/fx') invece di riscriverli:",
    ]
    for k in (blocks or ["tl", "beat", "text"]):
        lines.append(f"  - fx/{k}: {BLOCKS[k][0]}")
    lines += [
        "- Se il prompt chiede GSAP, three.js o CSS, traducili in questi blocchi: il render è offline, fotogramma per fotogramma.",
        "- Il testo a schermo è in italiano. Niente loghi di marchi e niente personaggi protetti: disegna icone e personaggi tuoi.",
        "- Senza voce fuori campo: come films/showreel, NO_VOICE = True in sound.py, la base di analysis/music.py a 120 bpm e i tagli sulla griglia (fx/beat: Grid, shots).",
        "- Movimento: molle senza rimbalzi (spring con overshoot ≤ 2%), l'uscita prima dell'entrata, niente dissolvenze incrociate pigre.",
        "- Niente numeri inventati: grafici e contatori mostrano solo dati veri, e il testo lo dice se sono stime.",
        f"- Controlla con un foglio provini (render.ts sheet, un fotogramma per battuto) prima del render completo, poi aggiungi il credito a @{v['author']} nella sezione Crediti del README.",
    ]
    if re.search(CARE, (v.get("prompt") or "").lower()):
        lines.append("- Attenzione: il prompt nomina marchi, personaggi o persone reali. Non rifarli: usa nomi, icone e personaggi inventati, e niente imitazioni di stile di una persona.")
    print("\n".join(lines))


def stats(_):
    data = load()
    m = [v for v in data if v["category"] == "motion"]
    print("categories:", dict(collections.Counter(v["category"] for v in data)))
    print("motion tech tags:", dict(collections.Counter(t for v in m for t in v["tech_tags"]).most_common()))
    c = collections.Counter(k for v in m for k in blocks_of(v))
    print(f"motion prompts each block serves (of {len(m)}):")
    for k, n in c.most_common():
        print(f"  {k:<11} {n:>4}  {BLOCKS[k][0]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fetch").set_defaults(fn=fetch)
    p = sub.add_parser("list")
    p.add_argument("--cat")
    p.add_argument("--tag")
    p.add_argument("--q")
    p.add_argument("--n", type=int, default=40)
    p.set_defaults(fn=ls)
    p = sub.add_parser("show")
    p.add_argument("slug")
    p.set_defaults(fn=show)
    p = sub.add_parser("adapt")
    p.add_argument("slug")
    p.add_argument("--film")
    p.add_argument("--format", default="9x16", choices=["9x16", "16x9"])
    p.add_argument("--sec", type=int, default=15)
    p.set_defaults(fn=adapt)
    sub.add_parser("stats").set_defaults(fn=stats)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
