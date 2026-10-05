"""Font files: names (for libass), metrics, text measurement, Google Fonts download."""
from __future__ import annotations

import re
import shutil
import urllib.parse
from functools import lru_cache
from pathlib import Path
from typing import Optional

from .common import BCError, DEFAULT_FONTS, slugify
from .net import http_get

FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2", ".ttc"}
_REF = 1000  # measurement size in pixels per em


class Font:
    """Metrics of one font file, matching how libass sizes text.

    libass (like VSFilter) maps the ASS font size to usWinAscent + usWinDescent,
    so 1 em = size * unitsPerEm / (winAscent + winDescent) pixels.
    """

    def __init__(self, path: Path):
        from fontTools.ttLib import TTFont
        self.path = Path(path)
        try:
            tt = TTFont(str(self.path), lazy=True, fontNumber=0)
        except Exception as e:
            raise BCError(f"The font file {self.path.name} could not be read.", detail=str(e))
        name = tt["name"]
        self.family = name.getBestFamilyName() or self.path.stem
        self.full_name = name.getDebugName(4) or self.family
        self.style = name.getBestSubFamilyName() or "Regular"
        os2 = tt["OS/2"] if "OS/2" in tt else None
        head = tt["head"]
        hhea = tt["hhea"]
        self.upem = head.unitsPerEm
        self.weight = getattr(os2, "usWeightClass", 400) if os2 else 400
        self.italic = bool(getattr(os2, "fsSelection", 0) & 1) if os2 else False
        asc = getattr(os2, "usWinAscent", 0) if os2 else 0
        desc = getattr(os2, "usWinDescent", 0) if os2 else 0
        if asc + desc <= 0:
            asc, desc = hhea.ascent, -hhea.descent
        self.win_asc, self.win_desc = asc, desc
        cap = getattr(os2, "sCapHeight", 0) if os2 else 0
        xh = getattr(os2, "sxHeight", 0) if os2 else 0
        self.cap = cap if cap and cap > 0.3 * self.upem else int(0.70 * self.upem)
        self.xh = xh if xh and xh > 0.2 * self.upem else int(0.50 * self.upem)
        tt.close()

    # ASS name: the full name is matched exactly by libass, so the right weight is used.
    @property
    def ass_name(self) -> str:
        return self.full_name

    def em(self, size: float) -> float:
        return size * self.upem / (self.win_asc + self.win_desc)

    def size_for_cap(self, cap_px: float) -> float:
        """ASS font size whose capital letters are cap_px pixels tall."""
        return cap_px * (self.win_asc + self.win_desc) / self.cap

    def asc_desc(self, size: float) -> tuple:
        k = size / (self.win_asc + self.win_desc)
        return self.win_asc * k, self.win_desc * k

    @lru_cache(maxsize=4096)
    def _len(self, text: str) -> float:
        return _pil(str(self.path)).getlength(text)

    def width(self, text: str, size: float, spacing: float = 0.0) -> float:
        if not text:
            return 0.0
        return self._len(text) * self.em(size) / _REF + spacing * len(text)

    def ink(self, text: str, size: float) -> tuple:
        """(top, bottom) of the drawn glyphs relative to the baseline (top is negative)."""
        if not text.strip():
            return (-self.cap * self.em(size) / self.upem, 0.0)
        _, y0, _, y1 = _pil(str(self.path)).getbbox(text, anchor="ls")
        k = self.em(size) / _REF
        return (y0 * k, y1 * k)


@lru_cache(maxsize=32)
def _pil(path: str):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(path, _REF, layout_engine=ImageFont.Layout.RAQM)
    except Exception:
        return ImageFont.truetype(path, _REF)


@lru_cache(maxsize=64)
def load_font(path: str) -> Font:
    return Font(Path(path))


def default_font(role: str) -> Path:
    return DEFAULT_FONTS / ("Montserrat-ExtraBold.ttf" if role == "display" else "Montserrat-Bold.ttf")


# ---------------------------------------------------------------- acquiring fonts


def to_sfnt(src: Path, dest_dir: Path) -> Path:
    """Copy a font into dest_dir; WOFF/WOFF2 are converted to TTF/OTF so libass can use them."""
    from fontTools.ttLib import TTFont
    src = Path(src)
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = src.suffix.lower()
    if ext in (".ttf", ".otf"):
        dest = dest_dir / src.name
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest
    if ext in (".woff", ".woff2", ".ttc"):
        try:
            tt = TTFont(str(src), fontNumber=0)
            tt.flavor = None
            out_ext = ".otf" if "CFF " in tt or "CFF2" in tt else ".ttf"
            dest = dest_dir / (src.stem + out_ext)
            tt.save(str(dest))
            return dest
        except Exception as e:
            raise BCError(f"The font {src.name} could not be converted.", detail=str(e))
    raise BCError(f"{src.name} is not a font file (use .ttf, .otf, .woff or .woff2).")


def google_weights(family: str) -> dict:
    """Available static TTF weights of a Google Font: {weight: url}. Empty if not on Google Fonts."""
    fam = urllib.parse.quote(family.strip()).replace("%20", "+")
    url = f"https://fonts.googleapis.com/css?family={fam}:100,200,300,400,500,600,700,800,900"
    try:
        css, _, _ = http_get(url, ua="Wget/1.12", timeout=20)
    except BCError:
        return {}
    out = {}
    for block in re.findall(r"@font-face\s*{([^}]*)}", css.decode("utf-8", "replace")):
        if "italic" in block:
            continue
        w = re.search(r"font-weight:\s*(\d+)", block)
        u = re.search(r"url\((https://[^)]+\.ttf)\)", block)
        if w and u:
            out[int(w.group(1))] = u.group(1)
    return out


def fetch_google_font(family: str, weight: int, dest_dir: Path) -> Path:
    weights = google_weights(family)
    if not weights:
        raise BCError(f'The font "{family}" is not available on Google Fonts.',
                      "Use the font file from the brand (.ttf/.otf/.woff2) or pick a similar Google Font.")
    best = min(weights, key=lambda w: (abs(w - int(weight)), -w))
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{slugify(family)}-{best}.ttf"
    if not dest.exists():
        data, _, _ = http_get(weights[best], timeout=40)
        dest.write_bytes(data)
    return dest


def fetch_font_url(url: str, dest_dir: Path) -> Path:
    data, final, _ = http_get(url, timeout=40)
    name = Path(urllib.parse.urlparse(final).path).name or "font.woff2"
    if Path(name).suffix.lower() not in FONT_EXTS:
        name += ".woff2" if data[:4] == b"wOF2" else ".woff" if data[:4] == b"wOFF" else ".ttf"
    tmp = dest_dir / ("_dl_" + name)
    dest_dir.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(data)
    try:
        return to_sfnt(tmp, dest_dir)
    finally:
        if tmp.exists() and tmp.suffix.lower() not in (".ttf", ".otf"):
            tmp.unlink()


def resolve_font(spec: Optional[dict], role: str, dest_dir: Path) -> Path:
    """spec: {"family": "Baloo 2", "weight": 800} | {"file": path} | {"url": url}. None → bundled default."""
    if not spec:
        return default_font(role)
    if spec.get("file"):
        p = Path(str(spec["file"])).expanduser()
        if not p.exists():
            raise BCError(f"The font file {p} does not exist.")
        return to_sfnt(p, dest_dir)
    if spec.get("url"):
        return fetch_font_url(spec["url"], dest_dir)
    if spec.get("family"):
        if spec["family"].strip().lower() == "montserrat":
            return default_font("display" if int(spec.get("weight", 800)) >= 800 else "text")
        return fetch_google_font(spec["family"], int(spec.get("weight", 700 if role == "text" else 800)), dest_dir)
    return default_font(role)
