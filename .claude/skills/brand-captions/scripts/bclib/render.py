"""Render an edit plan into the finished MP4 (two FFmpeg passes) and a preview contact sheet."""
from __future__ import annotations

import math
import os
import shutil
import statistics
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional

from .ass import Doc, Token, apply_case
from .brand import brand_fonts, brand_logo, load_brand, logo_color
from .captions import align, chunk, display_tokens, hide_windows, norm, time_chunks
from .common import (FORMATS, WORK_DIRNAME, BCError, contrast, ffmpeg, ffmpeg_filters, file_key, fmt_time, hash_obj,
                     read_json, run, say, write_json)
from .elements import (Frame, caption_events, endcard_events, endcard_layout, hook_events, label_events, make_look,
                       parse_marked)
from .media import clip_info, energy_db
from .plan import DEFAULT_DUR, Anchors, load_plan
from .presets import resolve_style
from .timeline import Timeline, speech_intervals, visual_interval

STAGE1_VERSION = 4


def _even(x: float) -> int:
    return int(math.ceil(x / 2.0) * 2)


def choose_fps(infos: List[dict], settings: dict) -> float:
    if settings.get("fps"):
        return float(settings["fps"])
    med = statistics.median([i["fps"] for i in infos]) if infos else 30.0
    if abs(med - 25) < 0.6:
        return 25.0
    if abs(med - 24) < 0.6:
        return 24.0
    return 30.0


def _hdr_chain(info: dict, filters: set) -> str:
    if not info.get("hdr") or not {"zscale", "tonemap"} <= filters:
        return ""
    return ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
            "zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


def _fit_of(clip: dict, info: dict, settings: dict, W: int, H: int) -> str:
    fit = clip.get("fit") or settings.get("fit") or "auto"
    if fit in ("fill", "blur", "fit"):
        return fit
    src_ratio = info["width"] / max(1, info["height"])
    out_ratio = W / H
    return "blur" if src_ratio > out_ratio * 1.6 else "fill"


# ---------------------------------------------------------------- stage 1: one normalised file per clip


def stage1_clip(clip: dict, info: dict, segs: list, fit: str, W: int, H: int, fps: float, filters: set,
                out: Path, pad_color: str) -> None:
    n = len(segs)
    zmax = max(s.zoom for s in segs)
    hdr = _hdr_chain(info, filters)
    parts = []
    if fit == "fill":
        pre = f"scale=w={_even(W * zmax)}:h={_even(H * zmax)}:force_original_aspect_ratio=increase:flags=lanczos"
        parts.append(f"[0:v]{pre}{',' + hdr if hdr else ''}[norm]")
    elif fit == "blur":
        bw, bh = _even(W / 4), _even(H / 4)
        parts.append(f"[0:v]scale=w={_even(W)}:h={_even(H)}:force_original_aspect_ratio=increase{',' + hdr if hdr else ''},"
                     f"split=2[bgs][fgs]")
        parts.append(f"[bgs]scale=w={bw}:h={bh}:force_original_aspect_ratio=increase,crop={bw}:{bh},"
                     f"boxblur=luma_radius=10:luma_power=2,scale={W}:{H},eq=brightness=-0.07:saturation=1.05[bgb]")
        parts.append(f"[fgs]scale=w={W}:h={H}:force_original_aspect_ratio=decrease:flags=lanczos[fgf]")
        parts.append("[bgb][fgf]overlay=(W-w)/2:(H-h)/2[norm]")
    else:
        parts.append(f"[0:v]scale=w={W}:h={H}:force_original_aspect_ratio=decrease:flags=lanczos"
                     f"{',' + hdr if hdr else ''},pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x{pad_color[1:]}[norm]")
    vlabels = [f"[s{i}]" for i in range(n)]
    parts.append(f"[norm]split={n}{''.join(vlabels)}" if n > 1 else "[norm]null[s0]")
    if info["has_audio"]:
        alabels = [f"[r{i}]" for i in range(n)]
        parts.append("[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
                     + (f",asplit={n}{''.join(alabels)}" if n > 1 else "[r0]"))
    concat_in = []
    for i, s in enumerate(segs):
        d = s.frames / fps
        if fit == "fill":
            if zmax == 1.0:
                crop = f"crop={W}:{H}"
            elif s.zoom == 1.0:
                crop = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}"
            else:
                crop = f"crop={W}:{H}:(iw-{W})/2:(ih-{H})*0.42"
        else:
            crop = "null"
        parts.append(f"[s{i}]trim=start={s.src_in:.4f}:end={s.src_out + 0.5 / fps:.4f},setpts=PTS-STARTPTS,{crop},"
                     f"fps={fps:g},tpad=stop_mode=clone:stop=4,trim=end_frame={s.frames},setpts=PTS-STARTPTS,"
                     f"format=yuv420p,setsar=1[v{i}]")
        if info["has_audio"]:
            parts.append(f"[r{i}]atrim=start={s.src_in:.4f}:end={s.src_out:.4f},asetpts=PTS-STARTPTS,"
                         f"afade=t=in:d=0.012,afade=t=out:st={max(0.0, d - 0.025):.4f}:d=0.025,"
                         f"apad=whole_dur={d:.4f},atrim=end={d:.4f}[a{i}]")
        else:
            parts.append(f"anullsrc=r=48000:cl=stereo,atrim=end={d:.4f}[a{i}]")
        concat_in.append(f"[v{i}][a{i}]")
    parts.append(f"{''.join(concat_in)}concat=n={n}:v=1:a=1[vout][aout]")
    tmp = out.with_suffix(".tmp.mov")
    run([ffmpeg(), "-v", "error", "-y", "-i", info["path"], "-filter_complex", ";".join(parts),
         "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14",
         "-pix_fmt", "yuv420p", "-g", str(int(fps * 2)), "-c:a", "pcm_s16le", "-ar", "48000", tmp],
        what=f"the edit of {clip['file']}")
    tmp.replace(out)


def stage1_endcard(out: Path, W: int, H: int, fps: float, frames: int, bg: str, logo: Optional[Path],
                   box: Optional[tuple]) -> None:
    d = frames / fps
    cmd = [ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x{bg[1:]}:s={W}x{H}:r={fps:g}:d={d + 0.5:.3f}"]
    parts = ["[0:v]format=yuv420p,setsar=1[bg]"]
    if logo and box:
        x, y, w, h = box
        cmd += ["-loop", "1", "-framerate", f"{fps:g}", "-t", f"{d + 0.5:.3f}", "-i", str(logo)]
        parts.append(f"[1:v]scale={_even(w)}:{_even(h)}:flags=lanczos,format=rgba,"
                     f"fade=t=in:st=0.10:d=0.35:alpha=1[lg]")
        parts.append(f"[bg][lg]overlay={x:.0f}:{y:.0f}:shortest=1[bl]")
        last = "[bl]"
    else:
        last = "[bg]"
    parts.append(f"{last}trim=end_frame={frames},setpts=PTS-STARTPTS,format=yuv420p[vout]")
    parts.append(f"anullsrc=r=48000:cl=stereo,atrim=end={d:.4f}[aout]")
    run(cmd + ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264",
               "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-ar", "48000",
               out], what="the end card")


# ---------------------------------------------------------------- stage 2: overlays, captions, sound


def _rounded_mask(path: Path, w: int, h: int, r: int) -> None:
    from PIL import Image, ImageDraw
    im = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, w * 2 - 1, h * 2 - 1], radius=r * 2, fill=255)
    im.resize((w, h), Image.LANCZOS).save(path)


def _broll_inputs(brolls: List[dict], folder: Path, rdir: Path, W: int, H: int, fps: float, first_index: int):
    """Inputs + filter parts that place b-roll (full screen or picture-in-picture) on the timeline."""
    inputs, parts, idx = [], [], first_index
    cur = "[base]"
    for j, b in enumerate(brolls):
        path = folder / b["file"]
        if not path.exists():
            raise BCError(f'The b-roll file "{b["file"]}" is not in the folder.')
        t0, t1 = b["start"], b["end"]
        d = t1 - t0
        is_img = path.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff")
        if is_img:
            inputs += ["-loop", "1", "-framerate", f"{fps:g}", "-t", f"{d:.3f}", "-i", str(path)]
        else:
            inputs += ["-ss", f"{float(b.get('from', 0)):.3f}", "-t", f"{d:.3f}", "-i", str(path)]
        src = f"[{idx}:v]"
        idx += 1
        mode = b.get("mode", "full")
        if mode == "pip":
            if is_img:
                from PIL import Image
                with Image.open(path) as im:
                    sw, sh = im.size
            else:
                inf = clip_info(path)
                sw, sh = inf["width"], inf["height"]
            landscape = W > H
            pw = _even(W * float(b.get("width", 0.42 if landscape else 0.62)))
            ph = _even(min(H * (0.62 if landscape else 0.45), pw * sh / max(1, sw)))
            mask = rdir / f"mask_{pw}x{ph}.png"
            if not mask.exists():
                _rounded_mask(mask, pw, ph, int(min(pw, ph) * 0.06))
            inputs += ["-loop", "1", "-i", str(mask)]
            midx = idx
            idx += 1
            pos = b.get("position", "right" if landscape else "upper")
            if pos in ("left", "right"):
                x = W * 0.05 if pos == "left" else W - pw - W * 0.05
                y = H * 0.42 - ph / 2.0
            else:
                ypos = {"top": 0.22, "upper": 0.30, "center": 0.40, "lower": 0.52}.get(pos, 0.30)
                x = (W - pw) / 2.0
                y = H * ypos - ph / 2.0
            parts.append(f"{src}fps={fps:g},scale={pw}:{ph}:force_original_aspect_ratio=increase,crop={pw}:{ph},"
                         f"format=yuva420p[bv{j}]")
            parts.append(f"[{midx}:v]format=gray,scale={pw}:{ph}[bm{j}]")
            parts.append(f"[bv{j}][bm{j}]alphamerge,fade=t=in:st=0:d=0.18:alpha=1,"
                         f"fade=t=out:st={max(0.0, d - 0.18):.3f}:d=0.18:alpha=1,setpts=PTS-STARTPTS+{t0:.3f}/TB[bp{j}]")
        else:
            zoom = f",scale=w='iw*(1+0.06*t/{max(d, 0.1):.2f})':h=-2:eval=frame,crop={W}:{H}" if is_img else ""
            parts.append(f"{src}fps={fps:g},scale={_even(W * 1.0)}:{_even(H * 1.0)}:force_original_aspect_ratio=increase,"
                         f"crop={W}:{H}{zoom},format=yuva420p,setpts=PTS-STARTPTS+{t0:.3f}/TB[bp{j}]")
            x, y = 0, 0
        parts.append(f"{cur}[bp{j}]overlay={x:.0f}:{y:.0f}:enable='between(t,{t0:.3f},{t1:.3f})':eof_action=pass[bo{j}]")
        cur = f"[bo{j}]"
    return inputs, parts, cur, idx


def stage2(rdir: Path, intermediates: List[Path], ass_name: str, out_tmp: Path, total: float, fps: float,
           brolls: List[dict], folder: Path, W: int, H: int, settings: dict) -> None:
    lst = rdir / "concat.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in intermediates), encoding="utf-8")
    cmd = [ffmpeg(), "-hide_banner", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst.name]
    parts = ["[0:v]setpts=PTS-STARTPTS[base]"]
    b_inputs, b_parts, vcur, next_idx = _broll_inputs(brolls, folder, rdir, W, H, fps, 1)
    cmd += b_inputs
    parts += b_parts
    parts.append(f"{vcur}ass=filename={ass_name}:fontsdir=fonts,format=yuv420p[vout]")
    audio = "[0:a]asetpts=PTS-STARTPTS,highpass=f=70"
    music = settings.get("music")
    if music:
        mfile = folder / (music["file"] if isinstance(music, dict) else str(music))
        if not mfile.exists():
            raise BCError(f"The music file {mfile.name} is not in the folder.")
        vol = float(music.get("volume", 1.0)) if isinstance(music, dict) else 1.0
        cmd += ["-stream_loop", "-1", "-i", str(mfile)]
        parts.append(f"{audio}[voice]")
        parts.append("[voice]asplit=2[v1][v2]")
        # any track is first brought to a background level (-24 LUFS), then `volume` scales it
        parts.append(f"[{next_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                     f"atrim=end={total + 1:.3f},loudnorm=I=-24:TP=-3:LRA=11,aresample=48000,volume={vol},"
                     f"atrim=end={total:.3f},afade=t=in:d=0.3,afade=t=out:st={max(0.0, total - 1.8):.3f}:d=1.8[mus]")
        parts.append("[mus][v2]sidechaincompress=threshold=0.035:ratio=6:attack=20:release=450[duck]")
        parts.append("[v1][duck]amix=inputs=2:duration=first:normalize=0[mixed]")
        audio = "[mixed]"
    loud = float(settings.get("loudness", -14))
    sep = "" if audio.endswith("]") else ","
    parts.append(f"{audio}{sep}loudnorm=I={loud:g}:TP=-1.5:LRA=11,aresample=48000[aout]")
    cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", str(settings.get("preset", "fast")), "-crf", str(settings.get("crf", 18)),
            "-profile:v", "high",
            "-pix_fmt", "yuv420p", "-r", f"{fps:g}", "-g", str(int(fps * 2)),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
            "-progress", "pipe:1", "-nostats", str(out_tmp)]
    proc = subprocess.Popen(cmd, cwd=str(rdir), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            encoding="utf-8", errors="replace")
    last = -1
    assert proc.stdout is not None
    for line in proc.stdout:
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                done = int(line.split("=")[1]) / 1e6
            except ValueError:
                continue
            pct = int(min(100, 100 * done / max(total, 0.1)) // 20 * 20)
            if pct > last and pct < 100:
                last = pct
                say(f"  … final render {pct}%")
    err = proc.stderr.read() if proc.stderr else ""
    if proc.wait() != 0:
        tail = "\n".join(err.strip().splitlines()[-25:])
        raise BCError("The final render failed.", detail=tail)


# ---------------------------------------------------------------- preview


def contact_sheet(video: Path, shots: List[tuple], out: Path, landscape: bool) -> Optional[Path]:
    from PIL import Image, ImageDraw, ImageFont
    if not shots:
        return None
    tw = 480 if landscape else 300
    tmpdir = out.parent / "frames"
    tmpdir.mkdir(parents=True, exist_ok=True)
    thumbs = []
    for i, (t, label) in enumerate(shots):
        png = tmpdir / f"f{i:02d}.png"
        try:
            run([ffmpeg(), "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
                 "-vf", f"scale={tw}:-2", png], what="the preview")
            thumbs.append((Image.open(png).convert("RGB"), f"{fmt_time(t)}  {label}"))
        except BCError:
            continue
    if not thumbs:
        return None
    cols = 3 if landscape else 4
    rows = math.ceil(len(thumbs) / cols)
    th = thumbs[0][0].size[1]
    pad, lab = 12, 34
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    try:
        from .fonts import default_font
        font = ImageFont.truetype(str(default_font("text")), 17)
    except Exception:
        font = ImageFont.load_default()
    for i, (im, label) in enumerate(thumbs):
        r, c = divmod(i, cols)
        x, y = pad + c * (tw + pad), pad + r * (th + lab + pad)
        sheet.paste(im, (x, y))
        label = " ".join(label.split())
        while label and draw.textlength(label, font=font) > tw - 4:
            label = label[:-2] + "…" if len(label) > 2 else ""
        draw.text((x + 2, y + th + 8), label, fill=(235, 235, 235), font=font)
    sheet.save(out, quality=86)
    shutil.rmtree(tmpdir, ignore_errors=True)
    return out


# ---------------------------------------------------------------- main


def _duplicate(text: str, chunks: List[dict], s: float, e: float) -> bool:
    words = [norm(t.text) for line in parse_marked(text) for t in line]
    words = [w for w in words if w]
    if not words:
        return False
    spoken = {norm(t.text) for ch in chunks if ch["end"] > s - 0.2 and ch["start"] < e + 0.2 for t in ch["tokens"]}
    return sum(1 for w in words if w in spoken) / len(words) >= 0.6


def render_plan(plan_path: Path) -> dict:
    t_start = time.time()
    plan, folder, work = load_plan(plan_path)
    brand = load_brand(plan.get("brand"))
    settings = dict(plan.get("settings") or {})
    style = resolve_style(brand, settings)
    style["reveal"] = settings.get("reveal")
    fmt = plan.get("format", "9:16")
    if fmt not in FORMATS:
        raise BCError(f'Unknown format "{fmt}".', "Use 9:16, 4:5, 1:1 or 16:9.")
    W, H = FORMATS[fmt]
    fr = Frame(W, H)
    fonts = brand_fonts(brand)
    colors = style["colors"]
    filters = ffmpeg_filters()
    if "ass" not in filters:
        raise BCError("This FFmpeg cannot draw captions (it was built without libass).",
                      "Install the full FFmpeg build: run bc.py doctor for the command.")
    warnings: List[str] = []

    clips = [c for c in plan["clips"] if not c.get("skip")]
    if not clips:
        raise BCError("The plan has no clips to use (all are skipped).")
    infos = {c["id"]: clip_info(folder / c["file"]) for c in clips}
    fps = choose_fps(list(infos.values()), settings)
    say(f"• Editing {len(clips)} clip(s) → {fmt} {W}x{H} @ {fps:g} fps")

    # 1. the cut ------------------------------------------------------------
    tl = Timeline(fps)
    sent_index: Dict[str, dict] = {}
    clip_sids: Dict[str, List[str]] = {}
    fits: Dict[str, str] = {}
    for c in clips:
        info = infos[c["id"]]
        tr_path = work / "transcripts" / f"{c['file']}.json"
        tr = read_json(tr_path) if tr_path.exists() else {"words": [], "sentences": []}
        words, tsents = tr.get("words") or [], tr.get("sentences") or []
        psents = c.get("sentences") or []
        if psents and len(psents) != len(tsents):
            raise BCError(f"The sentences of {c['id']} ({c['file']}) do not match its transcript.",
                          "Do not add, split or merge sentences in the plan: change only text and keep. "
                          "Run prepare again to start from a fresh plan.")
        runs, dropped, cur = [], [], []
        sids = []
        for k, ts in enumerate(tsents):
            ps = psents[k] if k < len(psents) else {}
            sid = ps.get("id") or f"{c['id']}.s{k + 1}"
            wl = words[ts["w0"]:ts["w1"]]
            keep = ps.get("keep", True) is not False
            toks = align(wl, ps.get("text"))
            sent_index[sid] = {"clip": c["id"], "start": ts["start"], "end": ts["end"], "keep": keep,
                               "tokens": [t for t in toks if not t.cut], "caption": ps.get("caption", True)}
            sids.append(sid)
            if not keep:
                if cur:
                    runs.append(cur)
                cur = []
                dropped.append((ts["start"], ts["end"]))
                continue
            for t in toks:
                if t.cut:
                    if cur:
                        runs.append(cur)
                    cur = []
                    dropped.append((t.start, t.end))
                else:
                    cur.append({"w": t.text, "s": t.start, "e": max(t.end, t.start + 0.02)})
        if cur:
            runs.append(cur)
        clip_sids[c["id"]] = sids
        fit = _fit_of(c, info, settings, W, H)
        fits[c["id"]] = fit
        kind = c.get("kind", "speech")
        trim = tuple(c["trim"]) if c.get("trim") else None
        if kind == "speech" and runs:
            wav = work / "audio" / f"{c['file']}.wav"
            energy = energy_db(wav) if wav.exists() else None
            iv = speech_intervals(runs, dropped, info["duration"], settings.get("cut", "tight"), energy, trim)
        elif kind == "speech" and tsents and not runs:
            iv = []  # every sentence dropped → clip not used
        else:
            iv = visual_interval(info["duration"], trim)
        if not iv:
            warnings.append(f"{c['id']} ({c['file']}) has nothing left after the cut and is not used.")
            continue
        tl.add(c["id"], iv, bool(settings.get("zoom_cuts", True)) and fit == "fill" and kind == "speech")
    if not tl.segments:
        raise BCError("Nothing is left to show: every part of every clip is cut out.")
    main_end = tl.main_end
    anchors = Anchors(tl, sent_index, main_end)

    # 2. captions -------------------------------------------------------------
    case, punct = style.get("case"), style.get("punctuation", "keep")
    tokens: List[Token] = []
    starts = set()
    if settings.get("captions", True) is not False:
        for c in clips:
            for sid in clip_sids.get(c["id"], []):
                s = sent_index[sid]
                if not s["keep"] or s["caption"] is False:
                    continue
                mapped = []
                for tok in s["tokens"]:
                    if not (tl.kept(c["id"], tok.start) or tl.kept(c["id"], tok.end)):
                        continue
                    a = tl.to_out(c["id"], tok.start)
                    b = tl.to_out(c["id"], tok.end, prefer="prev")
                    mapped.append(Token(tok.text, tok.emph, a, max(a, b)))
                disp = display_tokens(mapped, case, punct)
                if disp:
                    starts.add(len(tokens))
                    tokens += disp
    cap_look = make_look(style["caption"], colors, fonts, fr.unit)
    max_w = W * float(style["caption"].get("width", 0.84))
    space = cap_look.font.width(" ", cap_look.size)

    def fits_line(toks):
        return sum(cap_look.font.width(t.text, cap_look.size) for t in toks) + space * (len(toks) - 1) <= max_w

    chunks = chunk(tokens, starts, fits_line, int(style["caption"].get("max_words", 4)))
    time_chunks(chunks)
    for ch in chunks:
        ch["end"] = min(ch["end"], main_end)

    # 3. overlays -------------------------------------------------------------
    doc = Doc(W, H)
    hide, brolls, shots = [], [], []
    endcard = None
    for i, ov in enumerate(plan.get("overlays") or []):
        t = ov["type"]
        if t == "endcard":
            if ov.get("enabled", True) is not False:
                endcard = dict(brand.get("endcard") or {})
                endcard.update({k: v for k, v in ov.items() if k not in ("type",)})
            continue
        try:
            start, end = anchors.window(ov, DEFAULT_DUR.get(t, 2.0))
        except BCError as e:
            raise BCError(f"Overlay #{i + 1} ({t}): {e.message}", e.hint)
        if t in ("broll", "image"):
            brolls.append(dict(ov, start=start, end=end))
            shots.append((start + min(0.6, (end - start) / 2), f"b-roll {ov.get('file', '')}"))
            continue
        if t in ("hook", "opener"):
            hook_events(doc, ov, style, fonts, fr, start, end, role="hook")
        elif t == "title":
            hook_events(doc, ov, style, fonts, fr, start, end, role="title")
        elif t == "punch":
            hook_events(doc, ov, style, fonts, fr, start, end, role="punch")
        elif t == "label":
            label_events(doc, ov, style, fonts, fr, start, end)
        hc = ov.get("hide_captions", "auto")
        if hc is True or (hc == "auto" and t in ("hook", "opener", "punch")
                          and _duplicate(ov.get("text", ""), chunks, start, end)):
            hide.append((start, end))
        shots.append((start + min(0.55, (end - start) / 2), f"{t}: {ov.get('text', '')}"))
    all_chunks = list(chunks)
    chunks = hide_windows(chunks, hide)
    caption_events(doc, chunks, style, fonts, fr)
    if chunks:
        picks = chunks if len(chunks) <= 4 else [chunks[int(k * (len(chunks) - 1) / 3)] for k in range(4)]
        for ch in picks:
            shots.append((ch["start"] + min(0.35, (ch["end"] - ch["start"]) / 2),
                          "captions: " + " ".join(t.text for t in ch["tokens"])))

    # 4. end card ---------------------------------------------------------------
    ec_frames, logo_png, logo_box = 0, None, None
    if endcard:
        dur = float(endcard.get("duration", DEFAULT_DUR["endcard"]))
        ec_frames = int(round(dur * fps))
        dur = ec_frames / fps
        logo = brand_logo(brand) if endcard.get("logo", True) is not False else None
        size = None
        if logo:
            from PIL import Image
            with Image.open(logo) as im:
                size = im.size
        card = {"name": brand.get("name") if not logo else None, "headline": endcard.get("headline"),
                "stats": endcard.get("stats"), "cta": endcard.get("cta"), "url": endcard.get("url"),
                "footnote": endcard.get("footnote")}
        layout = endcard_layout(card, style, fonts, fr, size)
        logo_box = endcard_events(doc, card, style, fonts, fr, main_end, main_end + dur, layout)
        if logo and logo_box:
            logo_png = logo
            if contrast(logo_color(logo), colors["background"]) < 1.6:
                from PIL import Image
                tinted = work / "render" / "logo-tinted.png"
                tinted.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(logo) as im:
                    im = im.convert("RGBA")
                    solid = Image.new("RGBA", im.size, colors["ink"])
                    solid.putalpha(im.getchannel("A"))
                    solid.save(tinted)
                logo_png = tinted
        shots.append((main_end + min(1.9, dur - 0.15), "end card"))
    total = main_end + ec_frames / fps

    # 5. files -------------------------------------------------------------------
    name = plan.get("name") or folder.name
    rdir = work / "render" / name
    (rdir / "fonts").mkdir(parents=True, exist_ok=True)
    for f in fonts.values():
        dest = rdir / "fonts" / f.path.name
        if not dest.exists() or dest.stat().st_size != f.path.stat().st_size:
            shutil.copy2(f.path, dest)
    (rdir / "captions.ass").write_text(doc.dumps(), encoding="utf-8")
    if settings.get("srt"):
        _write_srt(all_chunks, Path(folder / plan.get("output", f"{name}.mp4")).with_suffix(".srt"))

    # 6. stage 1 -----------------------------------------------------------------
    intermediates = []
    for c in clips:
        segs = tl.by_clip.get(c["id"])
        if not segs:
            continue
        info = infos[c["id"]]
        key = hash_obj({"v": STAGE1_VERSION, "file": file_key(Path(info["path"])), "fit": fits[c["id"]],
                        "segs": [(round(s.src_in, 4), round(s.src_out, 4), s.zoom, s.frames) for s in segs],
                        "W": W, "H": H, "fps": fps, "hdr": bool(_hdr_chain(info, filters)),
                        "pad": colors["background"]})
        out = rdir / f"clip-{c['id']}-{key}.mov"
        if not out.exists():
            say(f"  … cutting {c['file']} ({len(segs)} part{'s' if len(segs) > 1 else ''})")
            stage1_clip(c, info, segs, fits[c["id"]], W, H, fps, filters, out, colors["background"])
        intermediates.append(out)
    if ec_frames:
        key = hash_obj({"v": STAGE1_VERSION, "bg": colors["background"], "W": W, "H": H, "fps": fps,
                        "f": ec_frames, "box": [round(x) for x in logo_box] if logo_box else None,
                        "logo": file_key(logo_png) if logo_png else None})
        out = rdir / f"endcard-{key}.mov"
        if not out.exists():
            stage1_endcard(out, W, H, fps, ec_frames, colors["background"], logo_png, logo_box)
        intermediates.append(out)
    keep_names = {p.name for p in intermediates}
    for old in rdir.glob("*.mov"):
        if old.name not in keep_names:
            old.unlink()

    # 7. stage 2 -----------------------------------------------------------------
    out_rel = plan.get("output") or f"{name}.mp4"
    out_path = (folder / out_rel).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = work / "manifest.json"
    manifest = read_json(manifest_path) if manifest_path.exists() else {"outputs": []}
    if out_path.exists() and out_path.name not in manifest["outputs"] and out_path.parent == folder:
        out_path = out_path.with_name(out_path.stem + "-edited" + out_path.suffix)
    out_tmp = rdir / ("rendering" + out_path.suffix)
    say("  … adding captions, titles and sound")
    stage2(rdir, intermediates, "captions.ass", out_tmp, total, fps, brolls, folder, W, H, settings)
    shutil.move(str(out_tmp), str(out_path))
    if out_path.parent == folder and out_path.name not in manifest["outputs"]:
        manifest["outputs"].append(out_path.name)
        write_json(manifest_path, manifest)

    # 8. preview -------------------------------------------------------------------
    shots = sorted(s for s in shots if 0 <= s[0] < total)
    dedup = []
    for s in shots:
        if not dedup or s[0] - dedup[-1][0] > 0.3:
            dedup.append(s)
    preview = contact_sheet(out_path, dedup[:12], work / f"preview-{name}.jpg", W > H)
    src_total = sum(infos[c["id"]]["duration"] for c in clips)
    n_cuts = len(tl.segments) - len(tl.by_clip)
    summary = {
        "output": str(out_path), "duration": round(total, 2), "size_mb": round(out_path.stat().st_size / 1e6, 1),
        "clips": len(tl.by_clip), "cuts": n_cuts, "removed_seconds": round(max(0.0, src_total - main_end), 1),
        "captions": len(chunks), "preview": str(preview) if preview else None, "warnings": warnings,
        "render_seconds": round(time.time() - t_start, 1),
    }
    write_json(work / f"last-render-{name}.json", summary)
    return summary


def _write_srt(chunks: List[dict], path: Path) -> None:
    def ts(t):
        ms = int(round(t * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    lines = []
    for i, ch in enumerate(chunks, 1):
        lines.append(f"{i}\n{ts(ch['start'])} --> {ts(ch['end'])}\n{' '.join(t.text for t in ch['tokens'])}\n")
    path.write_text("\n".join(lines), encoding="utf-8")
