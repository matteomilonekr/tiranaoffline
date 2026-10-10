"""The last look before a video goes out: format, loudness, black, flat and frozen frames, a frame sheet and a
board of every cut. Run it on the finished file (the one with the sound):

    uv run --no-project --with numpy --with pillow python analysis/qc.py out/showreel_sfx.mp4 --film showreel
    uv run --no-project --with numpy --with pillow python analysis/qc.py my_video.mp4 --format 9x16 --sec 30

It writes out/<name>/qc/: report.md (what passed, what didn't, where), sheet.jpg (a frame a second), board.jpg
(each cut, from 0.3 s before to 0.3 s after) and report.json. Exit code 1 if a check fails.

The checks (the idea of error checks a video has to pass before delivery comes from Mortiflix,
github.com/GTKottman/mortiflix-oss; this code is written for this kit):
  format    the film's size, a constant frame rate, H.264 + AAC, yuv420p, the duration within 5% of --sec
  loudness  integrated -14 LUFS (±1) and a true peak at or below -1 dBTP
  black     no black frames, flat frames (a dip to one colour) or white flashes longer than 0.1 s
  frozen    nothing stands still for more than 2 s (compared with the grain blurred away, since the post's grain
            changes every frame: a stuck scene under moving grain is still stuck)
A moment that is designed so (a fade to black at the end, a white flash on a cut, a held end card) goes in
films/<film>/qc.json as {"allow": [[start, end, "why"], ...]}, or on the command line with --allow 17.8-18.4.
"""
import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW, SH = 54, 96  # analysis size (9:16; 16:9 swaps them)
LUFS, LUFS_TOL, TRUE_PEAK = -14.0, 1.0, -1.0
FLAT_STD, FLAT_MAX = 0.018, 0.10  # a frame this uniform is a flat colour; tolerated this long
# the picture stands still when a frame differs from the one a second before by less than FREEZE_DIFF (on average,
# 0..1): grain alone stays under 0.001, the slowest real drift in the kit's films is above 0.002
FREEZE_K, FREEZE_DIFF, FREEZE_MAX = 1.0, 0.0015, 2.0
CUT_DIFF = 0.03  # a peak of change at least this big is a cut or the middle of a transition


def ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def frames(path, w, h):
    """Every frame, small and grey, blurred a little so the film grain doesn't count as motion."""
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-vf", f"scale={w}:{h}:flags=area,gblur=sigma=1,format=gray", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32) / 255.0


def loudness(path):
    err = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    p = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary)
    return (float(i.group(1)) if i else None), (float(p.group(1)) if p and p.group(1) != "-inf" else None)


def runs(mask, fps, min_len):
    """[start s, end s] of each run of True at least min_len seconds long."""
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if (j - i) / fps >= min_len:
                out.append([i / fps, j / fps])
            i = j
        else:
            i += 1
    return out


def allowed(span, allow):
    return any(span[0] >= a - 0.05 and span[1] <= b + 0.05 for a, b, *_ in allow)


def font(size):
    for f in [os.path.join(ROOT, "app/public/fonts/spacegrotesk/SpaceGrotesk-500.ttf"), os.path.join(ROOT, "app/public/fonts/src/IBMPlexMono-Medium.ttf")]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def grab(path, t, w):
    """One frame at t, w px wide, as a PIL image."""
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", path, "-frames:v", "1", "-vf", f"scale={w}:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(raw)).convert("RGB") if raw else None


def sheet(path, dur, out, cols=10, w=162):
    ts = [k + 0.5 for k in range(int(dur))] or [dur / 2]
    ims = [grab(path, t, w) for t in ts]
    ims = [im for im in ims if im]
    if not ims:
        return
    h = ims[0].height
    rows = (len(ims) + cols - 1) // cols
    S = Image.new("RGB", (cols * (w + 6) + 6, rows * (h + 26) + 6), "#18181b")
    d, f = ImageDraw.Draw(S), font(14)
    for k, (im, t) in enumerate(zip(ims, ts)):
        x, y = 6 + (k % cols) * (w + 6), 6 + (k // cols) * (h + 26)
        S.paste(im, (x, y + 20))
        d.text((x, y + 2), f"{t:5.1f}s", font=f, fill="#d4d4d8")
    S.save(out, quality=88)


def board(path, cuts, out, w=120, steps=(-0.3, -0.2, -0.1, -0.033, 0.0, 0.033, 0.1, 0.2, 0.3)):
    if not cuts:
        return
    rows = []
    for c in cuts:
        rows.append([grab(path, c + s, w) for s in steps])
    h = next(im for r in rows for im in r if im).height
    S = Image.new("RGB", (90 + len(steps) * (w + 4) + 4, len(rows) * (h + 8) + 30), "#18181b")
    d, f = ImageDraw.Draw(S), font(13)
    for j, s in enumerate(steps):
        d.text((90 + 4 + j * (w + 4), 8), f"{s:+.2f}", font=f, fill="#a1a1aa")
    for i, (c, r) in enumerate(zip(cuts, rows)):
        y = 30 + i * (h + 8)
        d.text((8, y + h // 2 - 8), f"{c:6.2f}s", font=f, fill="#e4e4e7")
        for j, im in enumerate(r):
            if im:
                S.paste(im, (90 + 4 + j * (w + 4), y))
    S.save(out, quality=88)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--film", help="films/<film>: its format, fps and qc.json (designed moments)")
    ap.add_argument("--format", choices=["9x16", "16x9"], help="expected shape (default: the film's, else none)")
    ap.add_argument("--fps", type=float, help="expected frame rate (default: the film's)")
    ap.add_argument("--sec", type=float, help="target length: the duration must be within 5%%")
    ap.add_argument("--allow", action="append", default=[], help="a designed moment, start-end in seconds (repeatable)")
    ap.add_argument("--cuts", help="the board's times, comma-separated (default: found from the picture)")
    ap.add_argument("--out", help="default: out/<video name>/qc/")
    a = ap.parse_args()

    name = os.path.splitext(os.path.basename(a.video))[0]
    out = a.out or os.path.join(ROOT, "out", a.film or name, "qc")
    os.makedirs(out, exist_ok=True)
    allow = [[float(x) for x in s.split("-")] for s in a.allow]
    fmt, fps_want = a.format, a.fps
    if a.film:
        fj = json.load(open(os.path.join(ROOT, "films", a.film, "film.json")))
        fmt = fmt or fj.get("format")
        fps_want = fps_want or fj.get("fps")
        q = os.path.join(ROOT, "films", a.film, "qc.json")
        if os.path.exists(q):
            allow += json.load(open(q)).get("allow", [])

    info = ffprobe(a.video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    au = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    num, den = (int(x) for x in v["r_frame_rate"].split("/"))
    anum, aden = (int(x) for x in v["avg_frame_rate"].split("/"))
    fps = num / den
    checks = []

    def check(cid, ok, what, where=None, warn=False):
        checks.append({"id": cid, "result": "pass" if ok else ("warn" if warn else "fail"), "what": what, "where": where or []})

    # format
    W_, H_ = int(v["width"]), int(v["height"])
    want = {"9x16": (1080, 1920), "16x9": (1920, 1080)}.get(fmt)
    check("format-size", want is None or (W_, H_) == want, f"{W_}×{H_}" + (f" (vuole {want[0]}×{want[1]})" if want and (W_, H_) != want else ""))
    check("format-rate", abs(fps - anum / max(1, aden)) < 0.01 and (not fps_want or abs(fps - fps_want) < 0.01), f"{fps:g} fps costanti" + (f" (vuole {fps_want:g})" if fps_want and abs(fps - fps_want) >= 0.01 else ""))
    check("format-codecs", v["codec_name"] == "h264" and v.get("pix_fmt") == "yuv420p" and (au is None or au["codec_name"] == "aac"), f"{v['codec_name']} {v.get('pix_fmt')}" + (f" + {au['codec_name']}" if au else ", senza audio"))
    if a.sec:
        check("format-length", abs(dur - a.sec) <= 0.05 * a.sec, f"{dur:.2f} s (obiettivo {a.sec:g} s ±5%)")
    else:
        check("format-length", True, f"{dur:.2f} s")

    # loudness
    if au is None:
        check("loudness", False, "nessuna traccia audio", warn=True)
    else:
        lufs, peak = loudness(a.video)
        ok = lufs is not None and abs(lufs - LUFS) <= LUFS_TOL and peak is not None and peak <= TRUE_PEAK
        check("loudness", ok, f"{lufs} LUFS integrati, picco vero {peak} dBTP (vuole {LUFS:g} ±{LUFS_TOL:g}, picco ≤ {TRUE_PEAK:g})")

    # picture: flat frames and freezes, on small grey frames
    w, h = (SW, SH) if H_ >= W_ else (SH, SW)
    F = frames(a.video, w, h)
    std = F.reshape(len(F), -1).std(axis=1)
    mean = F.reshape(len(F), -1).mean(axis=1)
    diff = np.concatenate([[1.0], np.abs(np.diff(F, axis=0)).reshape(len(F) - 1, -1).mean(axis=1)])
    flat = std < FLAT_STD
    spans = runs(flat, fps, FLAT_MAX + 1e-6)
    bad = [s for s in spans if not allowed(s, allow)]
    kinds = lambda s: "nero" if mean[int(s[0] * fps)] < 0.08 else ("bianco" if mean[int(s[0] * fps)] > 0.92 else "un colore piatto")
    check("no-flat-frames", not bad, "nessun fotogramma nero, bianco o di un colore solo per più di 0,1 s" if not bad else f"{len(bad)} tratti piatti",
          [f"{s[0]:.2f}–{s[1]:.2f} s ({kinds(s)})" for s in bad])
    short = [s for s in runs(flat, fps, 1 / fps) if not allowed(s, allow) and s not in bad]
    if short:
        check("short-flat-frames", False, f"{len(short)} lampi brevi (≤ 0,1 s): voluti?", [f"{s[0]:.2f}–{s[1]:.2f} s ({kinds(s)})" for s in short], warn=True)
    # (frame against frame a second earlier, not the one before: a slow push-in changes little per frame but adds up)
    k = max(1, int(round(FREEZE_K * fps)))
    dk = np.concatenate([np.ones(k), np.abs(F[k:] - F[:-k]).reshape(len(F) - k, -1).mean(axis=1)])
    fz = [[s0 - FREEZE_K, s1] for s0, s1 in runs(dk < FREEZE_DIFF, fps, max(1 / fps, FREEZE_MAX - FREEZE_K))]
    fz = [s for s in fz if not allowed(s, allow)]
    check("no-freeze", not fz, f"niente fermo per più di {FREEZE_MAX:g} s" if not fz else f"{len(fz)} tratti fermi", [f"{s[0]:.2f}–{s[1]:.2f} s" for s in fz])

    # cuts and transitions, for the board: the peaks of change (a hard cut is one frame, a wipe a few), at least
    # 0.4 s apart, the biggest kept; or the times given with --cuts
    if a.cuts:
        merged = [float(x) for x in a.cuts.split(",")]
    else:
        k = 3
        peaks = [i for i in range(1, len(diff)) if diff[i] > CUT_DIFF and diff[i] >= diff[max(1, i - k):i + k + 1].max()]
        merged = []
        for i in sorted(peaks, key=lambda i: -diff[i]):
            if all(abs(i / fps - c) > 0.4 for c in merged):
                merged.append(i / fps)
        merged.sort()
    sheet(a.video, dur, os.path.join(out, "sheet.jpg"))
    board(a.video, merged, os.path.join(out, "board.jpg"))

    fails = [c for c in checks if c["result"] == "fail"]
    mark = {"pass": "✓", "warn": "!", "fail": "✗"}
    lines = [f"# QC · {os.path.basename(a.video)}", "", f"{W_}×{H_}, {fps:g} fps, {dur:.2f} s · {len(merged)} tagli trovati · "
             + ("**tutto a posto**" if not fails else f"**{len(fails)} da sistemare**"), "", "| | Controllo | Esito |", "|---|---|---|"]
    for c in checks:
        lines.append(f"| {mark[c['result']]} | `{c['id']}` | {c['what']}{'<br>' + '<br>'.join(c['where']) if c['where'] else ''} |")
    if allow:
        lines += ["", "Momenti voluti (esclusi dai controlli): " + "; ".join(f"{x[0]:g}–{x[1]:g} s" + (f" ({x[2]})" if len(x) > 2 else "") for x in allow)]
    lines += ["", "Guarda anche `sheet.jpg` (un fotogramma al secondo) e `board.jpg` (ogni taglio da -0,3 a +0,3 s): ogni fotogramma deve avere senso."]
    open(os.path.join(out, "report.md"), "w").write("\n".join(lines) + "\n")
    json.dump({"video": a.video, "duration": dur, "fps": fps, "size": [W_, H_], "cuts": merged, "checks": checks}, open(os.path.join(out, "report.json"), "w"), indent=1, ensure_ascii=False)
    for c in checks:
        print(f" {mark[c['result']]} {c['id']:<18} {c['what']}" + "".join(f"\n      {w_}" for w_ in c["where"]))
    print(f"{len(merged)} cuts · wrote {os.path.relpath(out, ROOT)}/report.md, sheet.jpg, board.jpg")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
