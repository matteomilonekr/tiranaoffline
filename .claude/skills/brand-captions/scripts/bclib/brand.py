"""Brand profiles: website scan, saving the profile (fonts, colours, logo), listing and loading."""
from __future__ import annotations

import html as htmllib
import io
import json
import re
import shutil
import urllib.parse
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional

from .common import (BRANDS_DIR, SCANS_DIR, BCError, hex_to_rgb, hsl, load_config, mix, parse_color, rgb_to_hex,
                     save_config, say, slugify, write_json, read_json, contrast, luminance)
from .fonts import Font, default_font, google_weights, load_font, resolve_font
from .net import http_get
from .presets import DEFAULT_COLORS, PRESETS

DEFAULT_BRAND = {
    "name": "Default", "slug": "default", "style": "clean", "case": "as-is",
    "colors": dict(DEFAULT_COLORS), "fonts": {}, "endcard": {"enabled": False},
}

GENERIC_FONTS = {"sans-serif", "serif", "monospace", "system-ui", "-apple-system", "blinkmacsystemfont", "inherit",
                 "initial", "unset", "cursive", "fantasy", "ui-sans-serif", "ui-serif", "ui-monospace", "arial",
                 "helvetica", "helvetica neue", "segoe ui", "roboto", "times new roman", "georgia", "verdana",
                 "tahoma", "courier new", "apple color emoji", "segoe ui emoji", "segoe ui symbol",
                 "noto color emoji", "emoji", "math", "revert", "var", "none", "times", "courier"}


# ---------------------------------------------------------------- profiles


def list_brands() -> List[dict]:
    out = []
    if BRANDS_DIR.exists():
        for d in sorted(BRANDS_DIR.iterdir()):
            p = d / "brand.json"
            if p.exists():
                try:
                    b = read_json(p)
                    out.append({"slug": d.name, "name": b.get("name"), "style": b.get("style"),
                                "website": b.get("website")})
                except BCError:
                    pass
    return out


def load_brand(slug: Optional[str] = None) -> dict:
    cfg = load_config()
    slug = slug or cfg.get("default_brand")
    if not slug or slug == "default":
        b = json.loads(json.dumps(DEFAULT_BRAND))
        b["_dir"] = None
        return b
    p = BRANDS_DIR / slug / "brand.json"
    if not p.exists():
        names = ", ".join(x["slug"] for x in list_brands()) or "none yet"
        raise BCError(f'The brand "{slug}" is not set up.', f"Saved brands: {names}.")
    b = read_json(p)
    b["_dir"] = str(p.parent)
    b.setdefault("slug", slug)
    return b


def brand_fonts(brand: dict) -> Dict[str, Font]:
    out = {}
    base = Path(brand["_dir"]) if brand.get("_dir") else None
    for role in ("display", "text"):
        spec = (brand.get("fonts") or {}).get(role) or {}
        f = spec.get("file")
        path = None
        if f and f != "default":
            path = Path(f) if Path(f).is_absolute() else (base / f if base else None)
            if path is None or not path.exists():
                say(f"  ! font file for {role} is missing, using the default font")
                path = None
        out[role] = load_font(str(path or default_font(role)))
    return out


def brand_logo(brand: dict) -> Optional[Path]:
    if brand.get("logo") and brand.get("_dir"):
        p = Path(brand["_dir"]) / brand["logo"]
        if p.exists():
            return p
    return None


def set_default(slug: str) -> None:
    cfg = load_config()
    cfg["default_brand"] = slug
    save_config(cfg)


# ---------------------------------------------------------------- logo


def _is_svg(data: bytes) -> bool:
    head = data[:600].lstrip().lower()
    return head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:3000].lower())


def logo_to_png(data: bytes, dest: Path, width: int = 1200) -> Path:
    """Any logo (SVG, PNG, JPG, WEBP…) → trimmed PNG with transparency."""
    from PIL import Image
    if _is_svg(data):
        try:
            import resvg_py
            data = bytes(resvg_py.svg_to_bytes(svg_string=data.decode("utf-8", "replace"), width=width))
        except Exception as e:
            raise BCError("The SVG logo could not be converted.", "Give a PNG version of the logo.", detail=str(e))
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:
        raise BCError("The logo image could not be read.", "Use a PNG, JPG, WEBP or SVG file.", detail=str(e))
    im = im.convert("RGBA")
    alpha = im.getchannel("A")
    if alpha.getextrema()[0] == 255:  # opaque: remove a flat background colour
        w, h = im.size
        px = im.load()
        corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
        c0 = corners[0]
        if all(sum(abs(a - b) for a, b in zip(c[:3], c0[:3])) < 36 for c in corners):
            data_px = list(im.getdata())
            out = []
            for p in data_px:
                d = sum(abs(a - b) for a, b in zip(p[:3], c0[:3]))
                out.append((p[0], p[1], p[2], 0 if d < 30 else (int(255 * (d - 30) / 40) if d < 70 else 255)))
            im.putdata(out)
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    if max(im.size) > width:
        im.thumbnail((width, width))
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest)
    return dest


def fetch_logo(src: str, dest: Path) -> Path:
    if re.match(r"https?://", src or ""):
        data, _, _ = http_get(src, timeout=30)
    else:
        p = Path(src).expanduser()
        if not p.exists():
            raise BCError(f"The logo file {p} does not exist.")
        data = p.read_bytes()
    return logo_to_png(data, dest)


def logo_color(path: Path) -> str:
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    im.thumbnail((200, 200))
    px = [p for p in im.getdata() if p[3] > 128]
    if not px:
        return "#000000"
    return rgb_to_hex([sum(p[i] for p in px) / len(px) for i in range(3)])


# ---------------------------------------------------------------- save


def _darkest(colors: List[str]) -> str:
    return min(colors, key=luminance)


def save_brand(draft: dict, make_default: bool = True) -> dict:
    name = (draft.get("name") or "").strip()
    if not name:
        raise BCError('The brand needs a "name".')
    slug = slugify(draft.get("slug") or name)
    d = BRANDS_DIR / slug
    (d / "fonts").mkdir(parents=True, exist_ok=True)
    style = draft.get("style") if draft.get("style") in PRESETS else "clean"

    colors = {}
    for k, v in (draft.get("colors") or {}).items():
        c = parse_color(v)
        if c:
            colors[k] = c
        else:
            say(f'  ! colour "{k}": "{v}" is not a colour, ignored')
    for k in ("accent", "secondary", "background", "ink", "text"):
        colors.setdefault(k, DEFAULT_COLORS[k])
    if "stroke" not in colors:
        base = _darkest([colors["secondary"], colors["ink"], colors["accent"]])
        colors["stroke"] = mix(base, "#000000", 0.6)

    fonts = {}
    specs = draft.get("fonts") or {}
    for role in ("display", "text"):
        spec = specs.get(role) or (specs.get("display") if role == "text" else None)
        path = resolve_font(spec, role, d / "fonts")
        f = Font(path)
        try:
            rel = str(path.relative_to(d))
        except ValueError:
            rel = "default" if path.parent == default_font(role).parent else str(path)
        fonts[role] = {"family": f.family, "style": f.style, "weight": f.weight, "file": rel}

    brand = {
        "name": name, "slug": slug, "website": draft.get("website"), "style": style,
        "colors": colors, "fonts": fonts,
    }
    for key in ("case", "punctuation", "anim", "highlight", "language"):
        if draft.get(key):
            brand[key] = draft[key]
    vocab = draft.get("vocabulary") or []
    if name not in vocab:
        vocab = [name] + list(vocab)
    brand["vocabulary"] = vocab[:30]
    if draft.get("logo"):
        try:
            fetch_logo(str(draft["logo"]), d / "logo.png")
            brand["logo"] = "logo.png"
        except BCError as e:
            say(f"  ! logo not saved: {e.message}")
    elif (d / "logo.png").exists():
        brand["logo"] = "logo.png"
    ec = dict(draft.get("endcard") or {})
    ec.setdefault("enabled", bool(ec.get("cta") or ec.get("url") or brand.get("logo")))
    brand["endcard"] = ec
    if draft.get("overrides"):
        brand["overrides"] = draft["overrides"]
    write_json(d / "brand.json", brand)
    cfg = load_config()
    if make_default or not cfg.get("default_brand"):
        set_default(slug)
    brand["_dir"] = str(d)
    return brand


# ---------------------------------------------------------------- website scan


class _Page(HTMLParser):
    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.stack: List[tuple] = []
        self.meta: Dict[str, str] = {}
        self.stylesheets: List[str] = []
        self.font_links: List[str] = []
        self.icons: List[tuple] = []
        self.imgs: List[dict] = []
        self.styles: List[str] = []
        self.inline: List[str] = []
        self.jsonld: List[str] = []
        self.headings: List[str] = []
        self.lang = None
        self.title = ""
        self._buf = None
        self._buf_tag = None

    def url(self, u: Optional[str], allow_data: bool = False) -> Optional[str]:
        if not u or (u.startswith("data:") and not allow_data):
            return None
        if u.startswith("data:"):
            return u
        return urllib.parse.urljoin(self.base, u.strip())

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "html" and a.get("lang"):
            self.lang = a["lang"]
        if a.get("style"):
            self.inline.append(a["style"])
        if tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key:
                self.meta[key] = a.get("content", "")
        elif tag == "link":
            rel = a.get("rel", "").lower()
            href = self.url(a.get("href"), allow_data="icon" in rel)
            if href and "stylesheet" in rel:
                (self.font_links if "fonts.googleapis.com" in href else self.stylesheets).append(href)
            elif href and "icon" in rel:
                size = 0
                m = re.search(r"(\d+)x\d+", a.get("sizes", ""))
                if m:
                    size = int(m.group(1))
                if "apple-touch" in rel:
                    size = max(size, 180)
                self.icons.append((size, href))
            elif href and "fonts.googleapis.com" in href:
                self.font_links.append(href)
        elif tag == "img":
            src = a.get("src") or a.get("data-src") or ""
            if a.get("srcset"):
                src = a["srcset"].split(",")[-1].strip().split(" ")[0] or src
            ctx = " ".join(" ".join(x[1].get(k, "") for k in ("class", "id", "aria-label", "href"))
                           + " " + x[0] for x in self.stack[-6:])
            self.imgs.append({"src": self.url(src), "alt": a.get("alt", ""), "attrs":
                              " ".join([a.get("class", ""), a.get("id", ""), src]), "ctx": ctx,
                              "w": a.get("width", ""), "h": a.get("height", "")})
        in_svg = any(t[0] == "svg" for t in self.stack)
        if (tag in ("style", "h1", "h2") or (tag == "title" and not in_svg and not self.title)
                or (tag == "script" and "ld+json" in a.get("type", ""))):
            self._buf, self._buf_tag = [], tag
        if tag not in ("meta", "link", "img", "br", "hr", "input", "source"):
            self.stack.append((tag, a))

    def handle_endtag(self, tag):
        if self._buf is not None and tag == self._buf_tag:
            text = "".join(self._buf)
            if tag == "style":
                self.styles.append(text)
            elif tag == "title":
                self.title = text.strip()
            elif tag == "script":
                self.jsonld.append(text)
            elif text.strip() and len(self.headings) < 12:
                self.headings.append(re.sub(r"\s+", " ", text).strip())
            self._buf = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._buf is not None:
            self._buf.append(data)


_RULE = re.compile(r"([^{}]*)\{([^{}]*)\}")
_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)")
_BRANDY = re.compile(r"primary|brand|accent|secondary|button|btn|cta|highlight|main|theme|link|tertiary")
_HUE_NAME = re.compile(r"red|orange|yellow|gold|green|lime|teal|cyan|blue|navy|indigo|violet|purple|lilac|"
                       r"lavender|pink|rose|magenta|coral|peach|mint|sky|sand|cream|ink|paper|night|sun")


def _alpha_ok(value: str) -> bool:
    m = re.search(r"rgba?\([^)]*[,/]\s*([\d.]+)(%?)\s*\)", value)
    if m:
        a = float(m.group(1)) / (100 if m.group(2) else 1)
        return a >= 0.5
    m = re.fullmatch(r"#[0-9a-fA-F]{8}", value.strip())
    if m:
        return int(value.strip()[7:9], 16) >= 128
    return True


def extract_colors(css_blocks: List[str]) -> dict:
    score: Counter = Counter()
    contexts: Dict[str, set] = defaultdict(set)
    named: Dict[str, str] = {}
    for css in css_blocks:
        for selector, body in _RULE.findall(css):
            sel = selector.strip().lower()[-120:]
            for decl in body.split(";"):
                if ":" not in decl:
                    continue
                prop, value = decl.split(":", 1)
                prop, value = prop.strip().lower(), value.strip()
                found = [m for m in _COLOR.findall(value) if _alpha_ok(m)]
                if prop.startswith("--") and not found:
                    if re.fullmatch(r"\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}", value):
                        found = [value]
                for raw in found:
                    c = parse_color(raw)
                    if not c:
                        continue
                    w = 1.0
                    if prop.startswith("--"):
                        w = 5.0 if _BRANDY.search(prop) else 4.0 if _HUE_NAME.search(prop) else 1.5
                        named.setdefault(prop, c)
                    elif "background" in prop:
                        w = 3.0
                    elif prop == "color":
                        w = 2.0
                    if re.search(r"button|btn|cta|header|nav|hero|badge", sel):
                        w *= 1.5
                    score[c] += w
                    if len(contexts[c]) < 4:
                        contexts[c].add(prop if prop.startswith("--") else f"{prop} @ {sel[-40:]}")
    chroma, light, dark = [], [], []
    for c, s in score.most_common():
        hh, sat, lig = hsl(c)
        entry = {"color": c, "score": round(s, 1), "seen_in": sorted(contexts[c])[:3]}
        if lig >= 0.93 or (sat < 0.12 and lig > 0.6):
            light.append(entry)
        elif lig <= 0.12 or (sat < 0.12 and lig <= 0.6):
            dark.append(entry)
        else:
            chroma.append(entry)
    clustered: List[dict] = []
    for e in chroma:
        r, g, b = hex_to_rgb(e["color"])
        for k in clustered:
            r2, g2, b2 = hex_to_rgb(k["color"])
            if ((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2) ** 0.5 < 30:
                k["score"] = round(k["score"] + e["score"], 1)
                break
        else:
            clustered.append(dict(e))
    clustered.sort(key=lambda e: -e["score"])
    ranked = sorted(named.items(), key=lambda kv: (not _BRANDY.search(kv[0]), not _HUE_NAME.search(kv[0])))
    return {"brand_colors": clustered[:10], "light_neutrals": light[:3], "dark_neutrals": dark[:3],
            "css_variables": dict(ranked[:40])}


def extract_fonts(css_blocks: List[tuple], font_links: List[str]) -> List[dict]:
    fams: Dict[str, dict] = {}

    def entry(name: str) -> dict:
        key = name.lower()
        if key not in fams:
            fams[key] = {"family": name, "count": 0, "heading": 0, "body": 0, "files": [], "google_link": False}
        return fams[key]

    for link in font_links:
        q = urllib.parse.urlparse(link).query
        for part in urllib.parse.parse_qs(q).get("family", []):
            for fam in part.split("|"):
                name = urllib.parse.unquote_plus(fam.split(":")[0]).strip()
                if name:
                    e = entry(name)
                    e["google_link"] = True
                    e["count"] += 3
    for css, base in css_blocks:
        for m in re.finditer(r"@font-face\s*\{([^}]*)\}", css):
            body = m.group(1)
            fm = re.search(r"font-family\s*:\s*['\"]?([^;'\"]+)", body)
            if not fm:
                continue
            e = entry(fm.group(1).strip())
            wm = re.search(r"font-weight\s*:\s*(\d+)", body)
            for u, fmt in re.findall(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)\s*(?:format\(['\"]?([\w-]+))?", body):
                if len(e["files"]) < 8 and not u.startswith("data:"):
                    e["files"].append({"url": urllib.parse.urljoin(base, u), "weight": int(wm.group(1)) if wm else None})
        for selector, body in _RULE.findall(css):
            sel = selector.strip().lower()
            for decl in body.split(";"):
                if ":" not in decl:
                    continue
                prop, value = decl.split(":", 1)
                prop = prop.strip().lower()
                if not (prop == "font-family" or (prop.startswith("--") and re.search(r"font", prop)
                                                  and re.search(r"famil|font$|font-(heading|body|title|display|base"
                                                                r"|primary|secondary|main|accent)$", prop))):
                    continue
                first = value.split(",")[0].strip().strip("'\"").strip()
                if (not first or first.lower() in GENERIC_FONTS or first.startswith("var(") or len(first) > 40
                        or not re.fullmatch(r"[A-Za-z][\w \-]*", first)
                        or first.lower() in ("normal", "bold", "italic", "regular", "light", "medium")):
                    continue
                e = entry(first)
                e["count"] += 1
                if re.search(r"\bh[1-3]\b|heading|title|display|hero|--font-heading", sel + " " + prop):
                    e["heading"] += 1
                if re.search(r"\bbody\b|\bhtml\b|\bp\b|--font-body|:root", sel + " " + prop):
                    e["body"] += 1
    out = sorted(fams.values(), key=lambda e: -(e["count"] + 2 * e["heading"]))
    for e in out[:5]:
        weights = google_weights(e["family"])
        e["google_fonts"] = bool(weights)
        e["google_weights"] = sorted(weights)
    return out[:8]


def _find_logos(page: _Page, html: str, final_url: str) -> List[dict]:
    cands = []

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "logo":
                    u = v.get("url") or v.get("contentUrl") if isinstance(v, dict) else v
                    if isinstance(u, str):
                        cands.append({"url": page.url(u), "score": 9, "why": "structured data"})
                else:
                    walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    for block in page.jsonld:
        try:
            walk(json.loads(block))
        except ValueError:
            continue
    host = urllib.parse.urlparse(final_url).netloc
    for img in page.imgs:
        if not img["src"]:
            continue
        txt = (img["attrs"] + " " + img["alt"]).lower()
        ctx = img["ctx"].lower()
        s = 0
        if "logo" in txt:
            s += 8
        if "logo" in ctx:
            s += 5
        if "header" in ctx or "nav" in ctx:
            s += 2
        if re.search(r'href="?(/|https?://' + re.escape(host) + r'/?)"?(\s|$)', ctx) or " / " in f" {ctx} ":
            s += 1
        if s >= 5:
            cands.append({"url": img["src"], "score": s, "why": "logo image",
                          "header": "header" in ctx or "nav" in ctx})
    # many "logo" images in the same folder = a wall of partner/client logos, not the brand's own
    by_dir = Counter(urllib.parse.urlparse(c["url"]).path.rsplit("/", 1)[0] for c in cands if c.get("url"))
    cands = [c for c in cands if not (c.get("why") == "logo image" and not c.get("header")
                                      and by_dir[urllib.parse.urlparse(c["url"]).path.rsplit("/", 1)[0]] >= 3)]
    for m in re.finditer(r"<svg\b[^>]*>.*?</svg>", html, flags=re.S | re.I):
        before = html[max(0, m.start() - 500):m.start()].lower()
        own = m.group(0)[:400].lower()
        if "logo" in own or re.search(r"logo[^<>]*>\s*(<[^>]+>\s*){0,3}$", before):
            if len(m.group(0)) < 200_000:
                cands.append({"svg": m.group(0), "score": 7, "why": "inline svg"})
        if len([c for c in cands if "svg" in c]) >= 2:
            break
    for size, href in sorted(page.icons, reverse=True)[:2]:
        cands.append({"url": href, "score": 3 if size >= 120 else 1, "why": f"icon {size}px"})
    if page.meta.get("og:image"):
        cands.append({"url": page.url(page.meta["og:image"]), "score": 2,
                      "why": "social preview image (usually a photo, rarely the logo)"})
    def width_of(u: str) -> int:
        m = re.search(r"[?&]width=(\d+)", u or "")
        return int(m.group(1)) if m else 10_000

    best: Dict[str, dict] = {}
    for c in cands:
        key = (c.get("url") or "").split("?")[0] or c.get("svg", "")[:200]
        if not key:
            continue
        if key in best:
            b = best[key]
            b["score"] = max(b["score"], c["score"])
            if c.get("url") and width_of(c["url"]) > width_of(b.get("url", "")):
                b["url"] = c["url"]
        else:
            best[key] = dict(c)
    out = sorted(best.values(), key=lambda c: -c["score"])
    for c in out:  # Shopify CDN images can be requested bigger
        u = c.get("url") or ""
        if ("cdn/shop/" in u or "cdn.shopify.com" in u) and width_of(u) < 1000:
            c["url"] = re.sub(r"([?&])width=\d+", r"\1width=1200", u)
    return out[:5]


_PROOF = re.compile(
    r"(?<![\d:.,/])((?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(?:\+|%|k\b|K\b|mila|million|milioni)?)\s+"
    r"((?:[A-Za-zÀ-ÿ'’]+\s)?(?:clienti|customers|klanten|kunden|clients|reviews|recensioni|beoordelingen|"
    r"sterren|stars|stelle|ordini|orders|negozi|stores|winkels|winkelpunten|paesi|countries|anni|years|jaar|"
    r"utenti|users|members|membri|studenti|students|downloads|aziende|companies|bedrijven|posti|seats|"
    r"giorni|days|dagen|partecipanti|attendees|speaker|ore|hours|uur)\b)", re.I)


def scan_website(url: str) -> dict:
    if not re.match(r"https?://", url):
        url = "https://" + url.strip().lstrip("/")
    body, final, ctype = http_get(url, accept="text/html,application/xhtml+xml")
    html = body.decode("utf-8", "replace")
    m = re.search(r'charset=["\']?([\w-]+)', html[:3000], re.I)
    if m and m.group(1).lower() not in ("utf-8", "utf8"):
        try:
            html = body.decode(m.group(1), "replace")
        except LookupError:
            pass
    page = _Page(final)
    page.feed(html)
    host = urllib.parse.urlparse(final).netloc.replace("www.", "")
    out_dir = SCANS_DIR / slugify(host)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("logo-*.png"):
        old.unlink()

    css_blocks = [(s, final) for s in page.styles] + [("x{" + s + "}", final) for s in page.inline]
    fetched = 0
    for href in page.stylesheets[:14]:
        try:
            data, curl, _ = http_get(href, timeout=20, max_bytes=3_000_000, accept="text/css,*/*")
            css = data.decode("utf-8", "replace")
            css_blocks.append((css, curl))
            fetched += 1
            for imp in re.findall(r"@import\s+(?:url\()?['\"]?([^'\")\s;]+)", css)[:4]:
                iu = urllib.parse.urljoin(curl, imp)
                if "fonts.googleapis.com" in iu:
                    page.font_links.append(iu)
                    continue
                try:
                    d2, u2, _ = http_get(iu, timeout=15, max_bytes=2_000_000)
                    css_blocks.append((d2.decode("utf-8", "replace"), u2))
                except BCError:
                    pass
        except BCError:
            continue
    colors = extract_colors([c for c, _ in css_blocks])
    if page.meta.get("theme-color") and parse_color(page.meta["theme-color"]):
        colors["theme_color"] = parse_color(page.meta["theme-color"])
    fonts = extract_fonts(css_blocks, page.font_links)
    logos = []
    for i, c in enumerate(_find_logos(page, html, final)):
        try:
            if c.get("svg"):
                raw = c["svg"].encode("utf-8")
                if b"xmlns" not in raw[:300]:
                    raw = raw.replace(b"<svg", b'<svg xmlns="http://www.w3.org/2000/svg"', 1)
            elif (c.get("url") or "").startswith("data:"):
                head, _, payload = c["url"].partition(",")
                if ";base64" in head:
                    import base64
                    raw = base64.b64decode(payload)
                else:
                    raw = urllib.parse.unquote(payload).encode("utf-8")
            else:
                raw, _, _ = http_get(c["url"], timeout=20, max_bytes=6_000_000)
            dest = out_dir / f"logo-{i + 1}.png"
            logo_to_png(raw, dest)
            src = c.get("url") or "inline svg"
            logos.append({"file": str(dest), "source": "inline icon" if src.startswith("data:") else src, "why": c["why"],
                          "score": c["score"], "color": logo_color(dest)})
        except BCError:
            continue
    text = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", html, flags=re.S | re.I)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text)
    proof, seen = [], set()
    for m in _PROOF.finditer(text):
        snippet = m.group(0).strip()
        if snippet.lower() in seen:
            continue
        seen.add(snippet.lower())
        ctx = text[max(0, m.start() - 50):m.end() + 50].strip()
        proof.append({"text": snippet, "context": "…" + ctx + "…"})
        if len(proof) >= 10:
            break
    result = {
        "url": final, "domain": host, "title": page.title, "language": page.lang,
        "site_name": page.meta.get("og:site_name"), "description": page.meta.get("description")
        or page.meta.get("og:description"), "headings": page.headings[:8],
        "colors": colors, "fonts": fonts, "logos": logos, "numbers": proof,
        "stylesheets_read": fetched,
    }
    write_json(out_dir / "scan.json", result)
    result["scan_file"] = str(out_dir / "scan.json")
    return result
