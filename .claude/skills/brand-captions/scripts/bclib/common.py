"""Shared helpers: paths, config, process execution, ffprobe, JSON and colours."""
from __future__ import annotations

import colorsys
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable, Optional

HOME = Path(os.environ.get("BRAND_CAPTIONS_HOME") or (Path.home() / ".brand-captions"))
SKILL_DIR = Path(__file__).resolve().parents[2]
ASSETS = SKILL_DIR / "assets"
DEFAULT_FONTS = ASSETS / "fonts"
BRANDS_DIR = HOME / "brands"
SCANS_DIR = HOME / "scans"
MODELS_DIR = HOME / "models"
BIN_DIR = HOME / "bin"
CONFIG_PATH = HOME / "config.json"
WORK_DIRNAME = ".brand-captions"
EDITED_DIRNAME = "edited"

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".m2ts", ".3gp", ".mpg", ".mpeg"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}

FORMATS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}


class BCError(Exception):
    """An error that is shown to the user in plain language.

    `hint` says what to do next. Claude relays both in the user's language.
    """

    def __init__(self, message: str, hint: Optional[str] = None, detail: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.hint = hint
        self.detail = detail


# ---------------------------------------------------------------- output


def setup_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass


def say(msg: str) -> None:
    print(msg, flush=True)


def fmt_time(t: float) -> str:
    t = max(0.0, t)
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:04.1f}"


# ---------------------------------------------------------------- config


def load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- processes


def find_tool(name: str) -> Optional[str]:
    exe = name + (".exe" if os.name == "nt" else "")
    local = BIN_DIR / exe
    if local.exists():
        return str(local)
    return shutil.which(name)


def ffmpeg() -> str:
    path = find_tool("ffmpeg")
    if not path:
        raise BCError("FFmpeg is not installed, and it is needed to edit video.",
                      "Run the system check: bc.py doctor — it shows the one command to install it.")
    return path


def ffprobe() -> str:
    path = find_tool("ffprobe")
    if not path:
        raise BCError("FFprobe (part of FFmpeg) is not installed.",
                      "Run the system check: bc.py doctor — it shows the one command to install it.")
    return path


def run(cmd: list, cwd: Optional[Path] = None, what: str = "a command") -> subprocess.CompletedProcess:
    proc = subprocess.run([str(c) for c in cmd], cwd=str(cwd) if cwd else None,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or proc.stdout or "").strip().splitlines()[-25:])
        raise BCError(f"Something went wrong while running {what}.", detail=tail)
    return proc


def probe(path: Path) -> dict:
    proc = subprocess.run([ffprobe(), "-v", "error", "-print_format", "json", "-show_format",
                           "-show_streams", str(path)], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise BCError(f"Could not read the file {Path(path).name}. It may be damaged or not a video.",
                      detail=proc.stderr.strip()[-800:])
    return json.loads(proc.stdout or "{}")


def ffmpeg_filters() -> set:
    proc = subprocess.run([ffmpeg(), "-hide_banner", "-filters"], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    names = set()
    for line in proc.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and re.fullmatch(r"[TSC.|]{2,3}", parts[0]):
            names.add(parts[1])
    return names


# ---------------------------------------------------------------- files & json


def file_key(path: Path, *extra: Any) -> str:
    st = Path(path).stat()
    raw = f"{Path(path).name}|{st.st_size}|{int(st.st_mtime)}|" + "|".join(str(e) for e in extra)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def hash_obj(obj: Any) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def read_json(path: Path) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise BCError(f"File not found: {path}")
    except json.JSONDecodeError as e:
        raise BCError(f"The file {Path(path).name} is not valid JSON (line {e.lineno}, column {e.colno}): {e.msg}",
                      "Fix the syntax (commas, quotes, brackets) and run the command again.")


def write_json(path: Path, data: Any) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def dumps_readable(obj: Any, inline_keys: Iterable[str] = ("sentences", "overlays", "stats"), indent: int = 0) -> str:
    """JSON with the items of some lists kept on one line each (easy to read and edit)."""
    inline_keys = set(inline_keys)
    pad = "  " * indent
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        items = []
        for k, v in obj.items():
            key = json.dumps(k, ensure_ascii=False)
            if k in inline_keys and isinstance(v, list):
                if not v:
                    items.append(f'{pad}  {key}: []')
                else:
                    inner = ",\n".join(f"{pad}    " + json.dumps(x, ensure_ascii=False) for x in v)
                    items.append(f"{pad}  {key}: [\n{inner}\n{pad}  ]")
            else:
                items.append(f"{pad}  {key}: " + dumps_readable(v, inline_keys, indent + 1))
        return "{\n" + ",\n".join(items) + f"\n{pad}}}"
    if isinstance(obj, list):
        if not obj or all(not isinstance(x, (dict, list)) for x in obj):
            return json.dumps(obj, ensure_ascii=False)
        inner = ",\n".join(f"{pad}  " + dumps_readable(x, inline_keys, indent + 1) for x in obj)
        return "[\n" + inner + f"\n{pad}]"
    return json.dumps(obj, ensure_ascii=False)


def natural_key(s: str) -> list:
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def slugify(name: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "brand"


# ---------------------------------------------------------------- colours


def parse_color(value: Any) -> Optional[str]:
    """Return '#RRGGBB' for hex / rgb() / hsl() / 'r, g, b' strings, else None."""
    if value is None:
        return None
    v = str(value).strip().lower()
    m = re.fullmatch(r"#?([0-9a-f]{3,8})", v)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h[:3])
        elif len(h) in (6, 8):
            h = h[:6]
        else:
            return None
        return "#" + h.upper()
    m = re.fullmatch(r"rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+[\d.]+%?)?\s*\)", v)
    if m:
        vals = []
        for x in m.groups():
            vals.append(float(x[:-1]) * 2.55 if x.endswith("%") else float(x))
        return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in vals)
    m = re.fullmatch(r"hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+[\d.]+%?)?\s*\)", v)
    if m:
        h, s, l = float(m.group(1)) / 360.0, float(m.group(2)) / 100.0, float(m.group(3)) / 100.0
        r, g, b = colorsys.hls_to_rgb(h % 1.0, l, s)
        return "#" + "".join(f"{round(c * 255):02X}" for c in (r, g, b))
    m = re.fullmatch(r"(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", v)
    if m and all(int(x) <= 255 for x in m.groups()):
        return "#" + "".join(f"{int(x):02X}" for x in m.groups())
    return None


def hex_to_rgb(h: str) -> tuple:
    h = parse_color(h) or "#000000"
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def rgb_to_hex(rgb: Iterable[float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def luminance(h: str) -> float:
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_to_rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def mix(a: str, b: str, t: float) -> str:
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(x + (y - x) * t for x, y in zip(ra, rb))


def readable_on(bg: str, light: str = "#FFFFFF", dark: str = "#111111") -> str:
    return light if contrast(bg, light) >= contrast(bg, dark) else dark


def hsl(h: str) -> tuple:
    r, g, b = (c / 255.0 for c in hex_to_rgb(h))
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    return hh, s, l
