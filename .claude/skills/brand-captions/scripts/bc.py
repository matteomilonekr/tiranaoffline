#!/usr/bin/env python3
"""Brand Captions — raw clips in, finished branded video out.

Usage (python3 on macOS/Linux, python on Windows):
  bc.py doctor [--install] [--skip-model]       check the computer / install what is missing
  bc.py scan <folder>                            list the clips in a folder
  bc.py prepare <folder> [--mode one|each] [--brand SLUG] [--language it] [--clips a.mov,b.mov]
                                                 transcribe + write the draft edit plan(s)
  bc.py render <plan.json | folder> [--all]      render the plan(s) into MP4 + preview sheet
  bc.py frames <video> [--at 1.2,3.5,...]        contact sheet of frames (for checking a video)
  bc.py brand scan <url>                         read colours, fonts, logo from a website
  bc.py brand save <draft.json> [--no-default]   create/update a brand profile
  bc.py brand list | show [SLUG] | use SLUG | sample [SLUG]
  bc.py config [key=value ...]                   show or change settings (whisper_model, default_brand)
  bc.py clean <folder>                           delete the work files of a folder (keeps the videos)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bclib.common import HOME, WORK_DIRNAME, BCError, load_config, save_config, say, setup_stdout  # noqa: E402

NEEDS_TOOLS = {"prepare", "render", "brand", "frames"}


def _venv_python() -> Path:
    return HOME / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _in_venv() -> bool:
    try:
        return Path(sys.prefix).resolve() == (HOME / "venv").resolve()
    except OSError:
        return False


def _reexec_in_venv() -> None:
    vp = _venv_python()
    if not vp.exists():
        raise BCError("Brand Captions is not set up on this computer yet.",
                      "Run the one-time setup: bc.py doctor --install")
    args = [str(vp), str(Path(__file__).resolve())] + sys.argv[1:]
    if os.name == "nt":
        sys.exit(subprocess.call(args))
    os.execv(str(vp), args)


def emit(result) -> None:
    print("RESULT " + json.dumps(result, ensure_ascii=False, indent=2), flush=True)


def cmd_doctor(a) -> int:
    from bclib import doctor
    rep = doctor.install(skip_model=a.skip_model) if a.install else doctor.check()
    doctor.print_report(rep)
    if a.json:
        emit(rep)
    return 0 if rep["ready"] else 1


def cmd_scan(a) -> int:
    from bclib.media import scan_folder
    res = scan_folder(Path(a.folder))
    n = len(res["videos"])
    total = sum(v["duration"] for v in res["videos"])
    say(f"Found {n} clip(s), {total:.0f} s in total.")
    for v in res["videos"]:
        say(f"  • {v['file']}  {v['duration']:.1f}s  {v['width']}x{v['height']}"
            f"{'  no sound' if not v['has_audio'] else ''}{'  HDR' if v['hdr'] else ''}")
    emit(res)
    return 0


def cmd_prepare(a) -> int:
    from bclib.brand import load_brand
    from bclib.common import write_json
    from bclib.media import scan_folder
    from bclib.plan import build_plan, write_plan
    from bclib.transcribe import transcribe_clips
    folder = Path(a.folder).expanduser().resolve()
    res = scan_folder(folder)
    videos = res["videos"]
    if a.clips:
        wanted = [x.strip() for x in a.clips.split(",") if x.strip()]
        videos = [v for v in videos if v["file"] in wanted]
        missing = set(wanted) - {v["file"] for v in videos}
        if missing:
            raise BCError("These clips are not in the folder: " + ", ".join(sorted(missing)))
    if not videos:
        hint = None
        if res["subfolders_with_videos"]:
            hint = "There are videos in sub-folders: " + ", ".join(s["folder"] for s in res["subfolders_with_videos"])
        raise BCError(f"No video clips found in {folder}.", hint)
    brand = load_brand(a.brand)
    work = folder / WORK_DIRNAME
    say(f"• Listening to {len(videos)} clip(s)…")
    transcripts = transcribe_clips(videos, work, a.language, brand.get("vocabulary"), hint=brand.get("language"))
    plans = []
    if a.mode == "one":
        name = a.name or folder.name
        plan = build_plan(name, folder, videos, transcripts, brand, f"{name}.mp4")
        path = work / "plan.json"
        write_plan(path, plan)
        plans.append(str(path))
    else:
        for v in videos:
            stem = Path(v["file"]).stem
            plan = build_plan(stem, folder, [v], transcripts, brand, f"edited/{stem}.mp4")
            path = work / "plans" / f"{stem}.json"
            write_plan(path, plan)
            plans.append(str(path))
    write_json(work / "last-scan.json", res)
    langs = sorted({t.get("language") for t in transcripts.values() if t.get("language") and t.get("words")})
    say(f"✓ Draft ready: {len(plans)} plan(s). Language: {', '.join(langs) or 'no speech'}.")
    emit({"plans": plans, "brand": brand.get("slug"), "languages": langs,
          "clips": [{"file": v["file"], "duration": v["duration"],
                     "words": len(transcripts[v["file"]].get("words") or [])} for v in videos]})
    return 0


def cmd_render(a) -> int:
    from bclib.render import render_plan
    target = Path(a.target).expanduser().resolve()
    if target.is_dir():
        work = target / WORK_DIRNAME if (target / WORK_DIRNAME).is_dir() else target
        if a.all or not (work / "plan.json").exists():
            paths = sorted((work / "plans").glob("*.json")) if (work / "plans").is_dir() else []
            paths = [p for p in paths if not p.name.endswith(".prev.json")]
            if not paths and (work / "plan.json").exists():
                paths = [work / "plan.json"]
        else:
            paths = [work / "plan.json"]
        if not paths:
            raise BCError(f"No edit plan found in {target}.", "Run prepare on the folder first.")
    else:
        paths = [target]
    results = []
    for i, p in enumerate(paths, 1):
        if len(paths) > 1:
            say(f"• Video {i}/{len(paths)}: {p.stem}")
        try:
            r = render_plan(p)
            say(f"✓ {Path(r['output']).name}: {r['duration']:.1f}s, {r['size_mb']} MB "
                f"({r['cuts']} cuts, {r['removed_seconds']}s removed) in {r['render_seconds']:.0f}s")
            results.append(r)
        except BCError as e:
            if len(paths) == 1:
                raise
            say(f"✗ {p.stem}: {e.message}")
            results.append({"plan": str(p), "error": e.message, "hint": e.hint, "detail": e.detail})
    emit(results[0] if len(results) == 1 else results)
    return 0 if all("error" not in r for r in results) else 2


def cmd_frames(a) -> int:
    from bclib.media import clip_info
    from bclib.render import contact_sheet
    video = Path(a.video).expanduser().resolve()
    info = clip_info(video)
    if a.at:
        times = [float(x) for x in a.at.split(",") if x.strip()]
    else:
        n = a.count
        times = [info["duration"] * (k + 0.5) / n for k in range(n)]
    out = Path(a.out) if a.out else video.with_name(video.stem + "-frames.jpg")
    sheet = contact_sheet(video, [(t, "") for t in times], out, info["width"] > info["height"])
    emit({"sheet": str(sheet)})
    return 0


def cmd_brand(a) -> int:
    from bclib import brand as B
    from bclib.common import read_json
    if a.action == "scan":
        if not a.arg:
            raise BCError("Give the website address, e.g. bc.py brand scan mybakery.com")
        say(f"• Reading {a.arg} …")
        res = B.scan_website(a.arg)
        say(f"✓ {len(res['colors']['brand_colors'])} brand colours, {len(res['fonts'])} fonts, "
            f"{len(res['logos'])} logo candidates")
        emit(res)
    elif a.action == "save":
        if not a.arg:
            raise BCError("Give the draft file: bc.py brand save draft.json")
        draft = read_json(Path(a.arg).expanduser())
        b = B.save_brand(draft, make_default=not a.no_default)
        say(f"✓ Brand \"{b['name']}\" saved ({b['style']} style). Fonts: {b['fonts']['display']['family']} / "
            f"{b['fonts']['text']['family']}.")
        out = {k: v for k, v in b.items() if k != "_dir"}
        out["folder"] = b["_dir"]
        if not a.no_sample:
            from bclib.sample import make_sample
            say("• Rendering a short sample to check the look…")
            out["sample"] = str(make_sample(B.load_brand(b["slug"])))
        emit(out)
    elif a.action == "list":
        cfg = load_config()
        emit({"brands": B.list_brands(), "default": cfg.get("default_brand")})
    elif a.action == "show":
        b = B.load_brand(a.arg)
        emit({k: v for k, v in b.items()})
    elif a.action == "use":
        if not a.arg:
            raise BCError("Give the brand name: bc.py brand use SLUG")
        B.load_brand(a.arg)
        B.set_default(a.arg)
        say(f"✓ Default brand: {a.arg}")
    elif a.action == "sample":
        from bclib.sample import make_sample
        emit({"sample": str(make_sample(B.load_brand(a.arg)))})
    else:
        raise BCError(f"Unknown brand action {a.action}.")
    return 0


def cmd_config(a) -> int:
    cfg = load_config()
    for kv in a.pairs:
        if "=" not in kv:
            raise BCError(f"Use key=value (got {kv}).")
        k, v = kv.split("=", 1)
        cfg[k.strip()] = None if v.strip() in ("", "none", "null") else v.strip()
    if a.pairs:
        save_config(cfg)
    emit(cfg)
    return 0


def cmd_clean(a) -> int:
    import shutil
    work = Path(a.folder).expanduser().resolve() / WORK_DIRNAME
    if work.is_dir():
        shutil.rmtree(work / "render", ignore_errors=True)
        shutil.rmtree(work / "audio", ignore_errors=True)
        if a.all:
            shutil.rmtree(work, ignore_errors=True)
    say("✓ Work files removed." if work.exists() or a.all else "Nothing to clean.")
    return 0


def main() -> int:
    setup_stdout()
    p = argparse.ArgumentParser(prog="bc.py", description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("doctor")
    s.add_argument("--install", action="store_true")
    s.add_argument("--skip-model", action="store_true")
    s.add_argument("--json", action="store_true")
    s = sub.add_parser("scan")
    s.add_argument("folder")
    s = sub.add_parser("prepare")
    s.add_argument("folder")
    s.add_argument("--mode", choices=["one", "each"], default="one")
    s.add_argument("--brand")
    s.add_argument("--language")
    s.add_argument("--clips")
    s.add_argument("--name")
    s = sub.add_parser("render")
    s.add_argument("target")
    s.add_argument("--all", action="store_true")
    s = sub.add_parser("frames")
    s.add_argument("video")
    s.add_argument("--at")
    s.add_argument("--count", type=int, default=8)
    s.add_argument("--out")
    s = sub.add_parser("brand")
    s.add_argument("action", choices=["scan", "save", "list", "show", "use", "sample"])
    s.add_argument("arg", nargs="?")
    s.add_argument("--no-default", action="store_true")
    s.add_argument("--no-sample", action="store_true")
    s = sub.add_parser("config")
    s.add_argument("pairs", nargs="*")
    s = sub.add_parser("clean")
    s.add_argument("folder")
    s.add_argument("--all", action="store_true")
    a = p.parse_args()
    try:
        if a.cmd in NEEDS_TOOLS and not _in_venv():
            _reexec_in_venv()
        return {"doctor": cmd_doctor, "scan": cmd_scan, "prepare": cmd_prepare, "render": cmd_render,
                "frames": cmd_frames, "brand": cmd_brand, "config": cmd_config, "clean": cmd_clean}[a.cmd](a)
    except BCError as e:
        say(f"✗ {e.message}")
        if e.hint:
            say(f"→ {e.hint}")
        if e.detail:
            say("details:\n" + e.detail)
        return 2
    except KeyboardInterrupt:
        say("✗ Stopped.")
        return 130
    except Exception as e:  # unexpected: keep it readable, keep the details for debugging
        import traceback
        say(f"✗ Unexpected problem: {type(e).__name__}: {e}")
        say("→ Try again; if it repeats, the details below explain where it happened.")
        say("details:\n" + "".join(traceback.format_exc().splitlines(True)[-12:]))
        return 3


if __name__ == "__main__":
    sys.exit(main())
