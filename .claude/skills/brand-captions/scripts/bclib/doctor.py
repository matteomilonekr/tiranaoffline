"""System check and one-time setup (Python packages in a private environment + speech model)."""
from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from .common import HOME, MODELS_DIR, BCError, find_tool, load_config, save_config, say

VENV = HOME / "venv"
REQUIREMENTS = ["faster-whisper>=1.1", "pillow>=10.1", "fonttools>=4.40", "brotli", "resvg-py", "numpy", "certifi"]
IMPORT_CHECK = "import faster_whisper, PIL, fontTools, numpy, brotli, resvg_py, certifi"


def venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ram_gb() -> Optional[float]:
    try:
        if sys.platform == "darwin":
            return int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).strip()) / 1e9
        if sys.platform.startswith("linux"):
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) / 1e6
        if os.name == "nt":
            import ctypes

            class MEMSTATUS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = MEMSTATUS()
            st.dwLength = ctypes.sizeof(MEMSTATUS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return st.ullTotalPhys / 1e9
    except Exception:
        return None
    return None


def pick_model() -> str:
    ram = ram_gb() or 8
    apple_silicon = sys.platform == "darwin" and platform.machine() == "arm64"
    strong = apple_silicon or (os.cpu_count() or 4) >= 8
    return "large-v3-turbo" if ram >= 7.5 and strong else "small"


def ffmpeg_install_hint() -> str:
    if sys.platform == "darwin":
        if shutil.which("brew"):
            return "brew install ffmpeg"
        return ('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
                "  (installs Homebrew), then: brew install ffmpeg")
    if os.name == "nt":
        return "winget install --id Gyan.FFmpeg -e   (then close and reopen Claude Code)"
    if shutil.which("apt-get"):
        return "sudo apt-get install -y ffmpeg"
    if shutil.which("dnf"):
        return "sudo dnf install -y ffmpeg"
    if shutil.which("pacman"):
        return "sudo pacman -S ffmpeg"
    return "install FFmpeg from https://ffmpeg.org/download.html"


def _ffmpeg_status() -> dict:
    path = find_tool("ffmpeg")
    if not path or not find_tool("ffprobe"):
        return {"ok": False, "message": "FFmpeg is missing (needed to cut and export video).",
                "fix": ffmpeg_install_hint()}
    try:
        ver = subprocess.run([path, "-hide_banner", "-version"], capture_output=True, text=True).stdout.split("\n")[0]
        filt = subprocess.run([path, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
        enc = subprocess.run([path, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    except Exception as e:
        return {"ok": False, "message": f"FFmpeg does not start: {e}", "fix": ffmpeg_install_hint()}
    version = re.search(r"version\s+(\S+)", ver)
    has_ass = re.search(r"\sass\s", filt) is not None
    has_x264 = "libx264" in enc
    if not has_ass or not has_x264:
        missing = ", ".join(x for x, ok in (("captions (libass)", has_ass), ("H.264 export (libx264)", has_x264))
                            if not ok)
        hint = ffmpeg_install_hint()
        if sys.platform == "darwin" and shutil.which("brew"):
            hint = "brew reinstall ffmpeg"
        return {"ok": False, "message": f"This FFmpeg lacks {missing}.", "fix": hint}
    return {"ok": True, "message": f"FFmpeg {version.group(1) if version else ''} ready",
            "hdr_tonemap": bool(re.search(r"\szscale\s", filt))}


def _venv_status() -> dict:
    vp = venv_python()
    if not vp.exists():
        return {"ok": False, "message": "The editing tools are not installed yet (one time, about 1-3 minutes).",
                "fix": "bc.py doctor --install"}
    r = subprocess.run([str(vp), "-c", IMPORT_CHECK], capture_output=True, text=True)
    if r.returncode != 0:
        return {"ok": False, "message": "Some editing tools are missing or broken.", "fix": "bc.py doctor --install",
                "detail": r.stderr.strip()[-400:]}
    return {"ok": True, "message": "Editing tools installed"}


def _model_status(name: str) -> dict:
    tag = name.replace("large-v3-turbo", "large-v3-turbo")
    found = list(MODELS_DIR.glob(f"models--*{tag}*")) if MODELS_DIR.exists() else []
    ready = any(list(p.glob("snapshots/*/model.bin")) for p in found)
    if ready:
        return {"ok": True, "message": f"Speech model ready ({name})"}
    return {"ok": False, "message": f"Speech model ({name}) not downloaded yet (one time, ~0.5-1.6 GB).",
            "fix": "bc.py doctor --install", "soft": True}


def check() -> dict:
    cfg = load_config()
    model = cfg.get("whisper_model") or pick_model()
    items = []
    py_ok = sys.version_info >= (3, 9)
    items.append({"name": "python", "ok": py_ok,
                  "message": f"Python {platform.python_version()}" + ("" if py_ok else " is too old (need 3.9+)"),
                  "fix": None if py_ok else ("brew install python" if sys.platform == "darwin" else
                                             "install Python 3.11 from https://www.python.org/downloads/")})
    items.append(dict(name="ffmpeg", **_ffmpeg_status()))
    items.append(dict(name="tools", **_venv_status()))
    items.append(dict(name="model", **_model_status(model)))
    free = shutil.disk_usage(str(HOME if HOME.exists() else Path.home())).free / 1e9
    items.append({"name": "disk", "ok": free > 3, "message": f"{free:.0f} GB free on disk",
                  "fix": None if free > 3 else "free some disk space (at least 3 GB)"})
    from .brand import list_brands
    brands = list_brands()
    ready = all(i["ok"] or i.get("soft") for i in items)
    return {"ready": ready, "os": f"{platform.system()} {platform.machine()}", "items": items,
            "brands": brands, "default_brand": cfg.get("default_brand"), "whisper_model": model,
            "home": str(HOME)}


def print_report(rep: dict) -> None:
    say(f"Brand Captions — system check ({rep['os']})")
    for i in rep["items"]:
        mark = "✓" if i["ok"] else ("○" if i.get("soft") else "✗")
        say(f"  {mark} {i['message']}")
        if not i["ok"] and i.get("fix"):
            say(f"      → {i['fix']}")
    if rep["brands"]:
        names = ", ".join(f"{b['slug']}{' (default)' if b['slug'] == rep['default_brand'] else ''}"
                          for b in rep["brands"])
        say(f"  ✓ Saved brands: {names}")
    else:
        say("  ○ No brand saved yet (it is set up on the first edit)")
    say("READY" if rep["ready"] else "NOT READY")


def install(skip_model: bool = False) -> dict:
    HOME.mkdir(parents=True, exist_ok=True)
    vp = venv_python()
    if not vp.exists():
        say("• Creating a private Python environment for Brand Captions…")
        r = subprocess.run([sys.executable, "-m", "venv", str(VENV)], capture_output=True, text=True)
        if r.returncode != 0:
            hint = ("sudo apt-get install -y python3-venv" if shutil.which("apt-get")
                    else "reinstall Python from https://www.python.org/downloads/")
            raise BCError("Python could not create its private environment.", hint, detail=r.stderr[-600:])
    say("• Installing the editing tools (speech recognition, fonts, images). This takes 1-3 minutes…")
    subprocess.run([str(vp), "-m", "pip", "install", "--disable-pip-version-check", "-q", "--upgrade", "pip"],
                   capture_output=True, text=True)
    r = subprocess.run([str(vp), "-m", "pip", "install", "--disable-pip-version-check", "-q", *REQUIREMENTS],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise BCError("Installing the editing tools failed.",
                      "Check the internet connection and try again. If it keeps failing, share the details.",
                      detail=(r.stderr or r.stdout)[-1500:])
    cfg = load_config()
    if not cfg.get("whisper_model"):
        cfg["whisper_model"] = pick_model()
        save_config(cfg)
    if not skip_model:
        name = cfg["whisper_model"]
        say(f"• Downloading the speech model ({name}, one time). This can take a few minutes…")
        code = ("import sys; from faster_whisper import WhisperModel; "
                f"WhisperModel({name!r}, device='cpu', compute_type='int8', download_root={str(MODELS_DIR)!r})")
        r = subprocess.run([str(vp), "-c", code], capture_output=True, text=True)
        if r.returncode != 0:
            raise BCError("The speech model could not be downloaded.",
                          "Check the internet connection and run the install again.", detail=r.stderr[-800:])
    rep = check()
    return rep
