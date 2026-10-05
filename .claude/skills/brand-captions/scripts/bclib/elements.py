"""Turn captions and text overlays (hook, title, punch word, label, end card) into ASS events."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

from .ass import (Doc, TextLook, Token, anim_tags, apply_case, ass_alpha, ass_color, block_width, escape,
                  line_centers, ms, rounded_rect, split_lines, token_runs)
from .common import contrast, mix, readable_on
from .fonts import Font
from .presets import color_of, on_color

POSITIONS = {"top": 0.20, "upper": 0.30, "center": 0.45, "middle": 0.45, "lower": 0.58, "bottom": 0.62}


def make_look(el: dict, colors: dict, fonts: Dict[str, Font], scale: float = 1.0) -> TextLook:
    font = fonts.get(el.get("font", "text")) or fonts["text"]
    cap = float(el.get("cap", 40)) * scale
    stroke = color_of(el.get("stroke"), colors)
    return TextLook(
        font=font, cap=cap,
        fill=color_of(el.get("fill", "text"), colors) or "#FFFFFF",
        emph=color_of(el.get("emph", "accent"), colors) or colors["accent"],
        stroke=stroke, stroke_w=float(el.get("stroke_w", 0)) * cap if stroke else 0.0,
        shadow=el.get("shadow"), shadow_color=color_of(el.get("shadow_color", "#000000"), colors) or "#000000",
        shadow_x=float(el.get("shadow_x", 0)) * cap, shadow_y=float(el.get("shadow_y", 0)) * cap,
        shadow_alpha=float(el.get("shadow_alpha", 1.0)), spacing=float(el.get("spacing", 0)) * cap)


_PUNCT_MIN = re.compile(r"[.,;:]+$")


def clean_word(text: str, punctuation: str) -> str:
    if punctuation == "minimal":
        # keep ? ! and inner punctuation (5.000, e-mail); drop trailing . , ; :
        if re.search(r"\d[.,]\d", text):
            return text.rstrip(".,;:") if not re.search(r"\d[.,]$", text) else text[:-1]
        return _PUNCT_MIN.sub("", text) or text
    return text


def parse_marked(text: str) -> List[List[Token]]:
    """'Oei, een *vlek*?\\nNext line' → lines of Tokens. *word* = highlighted, ~~words~~ = cut out."""
    lines = []
    for raw_line in re.split(r"\\n|\n", text or ""):
        chars, emph, cut, i = [], False, False, 0
        while i < len(raw_line):
            ch = raw_line[i]
            if raw_line.startswith("~~", i):
                cut = not cut
                i += 2
                continue
            if ch == "*":
                emph = not emph
                i += 1
                continue
            chars.append((ch, emph, cut))
            i += 1
        toks, cur, cur_e, cur_c = [], "", False, False
        for ch, e, c in chars + [(" ", False, False)]:
            if ch.isspace():
                if cur:
                    toks.append(Token(cur, cur_e, cut=cur_c))
                cur, cur_e, cur_c = "", False, False
            else:
                cur += ch
                cur_e = cur_e or (e and ch.isalnum())
                cur_c = cur_c or c
        if toks:
            lines.append(toks)
    return lines


@dataclass
class Frame:
    width: int
    height: int

    @property
    def unit(self) -> float:
        return min(self.width, self.height) / 1080.0


def _x_of(ov: dict, fr: Frame) -> float:
    x = ov.get("x")
    if isinstance(x, (int, float)):
        return fr.width * float(x)
    return fr.width / 2.0


def _y_of(ov: dict, default: float, fr: Frame) -> float:
    y = ov.get("y", ov.get("position"))
    if isinstance(y, (int, float)):
        return fr.height * float(y)
    if isinstance(y, str) and y in POSITIONS:
        return fr.height * POSITIONS[y]
    return fr.height * default


def fit_lines(lines_in: List[List[Token]], look: TextLook, max_w: float, max_lines: int,
              min_scale: float = 0.55) -> tuple:
    """Wrap each given line; shrink the text if it still does not fit."""
    lines: List[List[Token]] = []
    for ln in lines_in:
        lines += split_lines(ln, look, max_w, max_lines)
    bw = block_width(lines, look)
    if bw > max_w:
        k = max(min_scale, max_w / bw)
        look = look.scaled(k)
    return lines, look


def fit_block(text: str, look: TextLook, max_w: float, max_lines: int = 2) -> tuple:
    """One line if it fits (shrinking up to 35%), otherwise wrapped; returns (lines, look, height)."""
    lines_in = parse_marked(text)
    flat = [t for ln in lines_in for t in ln]
    if len(lines_in) == 1 and flat:
        w = block_width([flat], look)
        if w <= max_w:
            return [flat], look, look.cap
        if w * 0.65 <= max_w:
            lk = look.scaled(max_w / w)
            return [flat], lk, lk.cap
    lines, lk = fit_lines(lines_in, look, max_w, max_lines, 0.5)
    return lines, lk, lk.cap + (len(lines) - 1) * lk.pitch


def text_block(doc: Doc, lines: List[List[Token]], look: TextLook, x: float, y: float, start: float, end: float,
               anim: str, role: str, layer: int, valign: str = "middle", stagger: float = 0.0,
               exit_fade: bool = True, mode: str = "static", active: Optional[str] = None) -> None:
    centers = line_centers(len(lines), look, y, valign)
    before = 0
    for ln, cy in zip(lines, centers):
        head = "{\\an5" + look.tags() + anim_tags(anim, role, x, cy, end - start, exit_fade) + "}"
        body = token_runs(ln, look, start, mode=mode, active_color=active, stagger=stagger, first_index=before)
        before += len(ln)
        doc.add(start, end, head + body, layer)


# ---------------------------------------------------------------- captions


def caption_events(doc: Doc, chunks: list, style: dict, fonts: Dict[str, Font], fr: Frame) -> None:
    el = style["caption"]
    colors = style["colors"]
    look = make_look(el, colors, fonts, fr.unit)
    max_w = fr.width * float(el.get("width", 0.84))
    y = fr.height * float(el.get("y", 0.70))
    highlight = style.get("highlight", "keywords")
    mode = "active" if highlight in ("active", "both") else "static"
    if style.get("reveal") == "word":
        mode = "reveal"
    active = color_of(el.get("active", "accent"), colors)
    for i, ch in enumerate(chunks):
        toks = ch["tokens"]
        if highlight in ("none", "active"):
            toks = [Token(t.text, False, t.start, t.end) for t in toks]
        lines, lk = fit_lines([toks], look, max_w, 2, 0.7)
        nxt = chunks[i + 1]["start"] if i + 1 < len(chunks) else None
        gap_after = (nxt - ch["end"]) if nxt is not None else 9.0
        text_block(doc, lines, lk, fr.width / 2.0, y, ch["start"], ch["end"], style["anim"], "caption", 10,
                   exit_fade=gap_after > 0.3, mode=mode, active=active)


# ---------------------------------------------------------------- overlays


def hook_events(doc: Doc, ov: dict, style: dict, fonts: Dict[str, Font], fr: Frame, start: float, end: float,
                role: str = "hook") -> None:
    el = style[role]
    look = make_look(el, style["colors"], fonts, fr.unit * float(ov.get("size", 1.0)))
    lines_in = parse_marked(apply_case(ov.get("text", ""), el.get("case") or style.get("case")))
    if not lines_in:
        return
    max_w = fr.width * float(el.get("width", 0.84))
    if role == "punch" and len(lines_in) == 1:
        lines, look, _ = fit_block(ov.get("text", "") and " ".join(t.text if not t.emph else f"*{t.text}*"
                                                                   for t in lines_in[0]), look, max_w, 2)
    else:
        lines, look = fit_lines(lines_in, look, max_w, 4 if role != "punch" else 2, 0.5)
    x = _x_of(ov, fr)
    if role == "title":
        y = _y_of(ov, float(el.get("y", 0.09)), fr)
        valign = "top"
    else:
        y = _y_of(ov, float(el.get("y", 0.45)), fr)
        valign = "middle"
    stagger = 0.07 if (role == "hook" and style["anim"] in ("rise", "fade")) else 0.0
    text_block(doc, lines, look, x, y, start, end, style["anim"], role, 30 if role == "punch" else 20,
               valign=valign, stagger=stagger)


def label_events(doc: Doc, ov: dict, style: dict, fonts: Dict[str, Font], fr: Frame, start: float,
                 end: float) -> None:
    el = style["label"]
    colors = style["colors"]
    look = make_look(el, colors, fonts, fr.unit * float(ov.get("size", 1.0)))
    case = el.get("case") or style.get("case")
    text = apply_case(re.sub(r"\*", "", ov.get("text", "")), case).strip()
    if not text:
        return
    tw = look.font.width(text, look.size, look.spacing)
    max_w = fr.width * 0.8 - 2 * look.cap * float(el.get("pad_x", 1.0))
    if tw > max_w:
        look = look.scaled(max_w / tw)
        tw = max_w
    cap = look.cap
    w = tw + 2 * cap * float(el.get("pad_x", 1.0))
    h = cap + 2 * cap * float(el.get("pad_y", 0.65))
    r = min(h / 2.0, float(el.get("radius", 1.0)) * h)
    x = _x_of(ov, fr)
    y = _y_of(ov, float(el.get("y", 0.30)), fr)
    box = color_of(ov.get("color") or el.get("box", "secondary"), colors)
    text_color = color_of(el.get("fill"), colors) or on_color(box, colors["ink"])
    if contrast(box, text_color) < 2.0:
        text_color = on_color(box, colors["ink"])
    border = color_of(el.get("border"), colors)
    bw = float(el.get("border_w", 0.12)) * cap if border else 0.0
    dur = end - start
    # the box
    shadow = ""
    if el.get("shadow") == "hard":
        shadow = (f"\\xshad0\\yshad{float(el.get('shadow_y', 0.1)) * cap:.1f}"
                  f"\\4c{ass_color(color_of(el.get('shadow_color', 'stroke'), colors) or '#000000')}\\4a&H00&")
    elif el.get("shadow") == "soft":
        shadow = (f"\\xshad0\\yshad{max(2.0, float(el.get('shadow_y', 0.1)) * cap):.1f}\\4c&H000000&"
                  f"\\4a{ass_alpha(float(el.get('shadow_alpha', 0.35)))}\\blur{cap * 0.25:.1f}")
    else:
        shadow = "\\shad0"
    border_tags = (f"\\bord{bw:.1f}\\3c{ass_color(border)}\\3a&H00&" if border else "\\bord0")
    box_tags = ("{\\an5" + anim_tags(style["anim"], "label", x, y, dur) + f"\\p1\\1c{ass_color(box)}\\1a&H00&"
                + border_tags + shadow + "}")
    doc.add(start, end, box_tags + rounded_rect(w, h, r) + "{\\p0}", 40)
    # the text, ink-centred on the box
    asc, desc = look.font.asc_desc(look.size)
    top, bottom = look.font.ink(text, look.size)
    ty = y - (asc - desc) / 2.0 - (top + bottom) / 2.0
    plain = TextLook(font=look.font, cap=look.cap, fill=text_color, emph=text_color, spacing=look.spacing)
    head = "{\\an5" + plain.tags() + anim_tags(style["anim"], "label", x, ty, dur) + "}"
    doc.add(start, end, head + escape(text), 41)


# ---------------------------------------------------------------- end card


def endcard_layout(card: dict, style: dict, fonts: Dict[str, Font], fr: Frame, logo_size: Optional[tuple]) -> dict:
    """Compute positions of every end-card element. Returns dict with blocks and logo box."""
    colors = style["colors"]
    W, H, u = fr.width, fr.height, fr.unit
    bg = colors["background"]
    dark_bg = contrast(bg, "#FFFFFF") > contrast(bg, "#111111")
    ink = colors["ink"] if contrast(colors["ink"], bg) >= 3 else readable_on(bg)
    second = colors["secondary"] if contrast(colors["secondary"], bg) >= 2.2 else ink
    accent = colors["accent"]
    landscape = W > H
    blocks = []
    disp, txt = fonts["display"], fonts["text"]
    max_w = W * (0.60 if landscape else 0.84)

    def text(kind, value, look, max_lines=2):
        lines, lk, h = fit_block(value, look, max_w, max_lines)
        blocks.append({"kind": kind, "h": h, "lines": lines, "look": lk})

    if logo_size:
        lw, lh = logo_size
        aspect = lw / max(1, lh)
        box_w, box_h = (0.30 * W, 0.16 * H) if landscape else (0.62 * W, 0.13 * H)
        h = min(box_h, box_w / aspect)
        blocks.append({"kind": "logo", "h": h, "w": h * aspect})
    elif card.get("name"):
        text("name", card["name"], TextLook(font=disp, cap=80 * u, fill=ink, emph=accent))
    if card.get("headline"):
        text("headline", card["headline"], TextLook(font=txt, cap=36 * u, fill=ink, emph=accent))
    stats = [s for s in (card.get("stats") or []) if s.get("value")][:4]
    if stats:
        cols = len(stats) if (landscape or len(stats) == 3) else (1 if len(stats) == 1 else 2)
        rows = math.ceil(len(stats) / cols)
        card_h = (0.20 * H if landscape else 0.125 * H)
        gap = 30 * u
        blocks.append({"kind": "stats", "h": rows * card_h + (rows - 1) * gap, "cols": cols, "rows": rows,
                       "card_h": card_h, "gap": gap, "items": stats})
    if card.get("cta"):
        blocks.append({"kind": "cta", "h": 42 * u * 3.2, "text": card["cta"]})
    if card.get("url"):
        text("url", card["url"], TextLook(font=disp, cap=36 * u, fill=second, emph=accent), 1)
    if card.get("footnote"):
        text("footnote", card["footnote"], TextLook(font=txt, cap=17 * u, fill=mix(ink, bg, 0.45), emph=ink))
    gaps = {"logo": 92, "name": 80, "headline": 64, "stats": 78, "cta": 52, "url": 28, "footnote": 0}
    total = sum(b["h"] for b in blocks) + sum(gaps[b["kind"]] * u for b in blocks[:-1])
    y = max(0.07 * H, (H - total) / 2.0 - 0.02 * H)
    for b in blocks:
        b["top"] = y
        y += b["h"] + gaps[b["kind"]] * u
    return {"blocks": blocks, "ink": ink, "second": second, "accent": accent, "dark_bg": dark_bg, "bg": bg}


def endcard_events(doc: Doc, card: dict, style: dict, fonts: Dict[str, Font], fr: Frame, start: float, end: float,
                   layout: dict) -> Optional[tuple]:
    """Add end-card text and shapes; return the logo box (x, y, w, h) for the video overlay."""
    colors = style["colors"]
    ec = style.get("endcard", {})
    W, H, u = fr.width, fr.height, fr.unit
    anim = style["anim"]
    ink, second, accent, bg = layout["ink"], layout["second"], layout["accent"], layout["bg"]
    card_fill = mix(bg, "#FFFFFF", 0.10) if layout["dark_bg"] else "#FFFFFF"
    if not layout["dark_bg"] and contrast(bg, "#FFFFFF") < 1.06:
        card_fill = mix(bg, "#000000", 0.04)
    logo_box = None
    delay = 0.12
    disp, txt = fonts["display"], fonts["text"]
    for b in layout["blocks"]:
        k = b["kind"]
        t0 = start + delay
        if k == "logo":
            logo_box = ((W - b["w"]) / 2.0, b["top"], b["w"], b["h"])
        elif k in ("name", "headline", "url", "footnote"):
            text_block(doc, b["lines"], b["look"], W / 2.0, b["top"], t0, end, anim, "card", 60, valign="top",
                       exit_fade=False)
        elif k == "stats":
            cols, card_h, gap = b["cols"], b["card_h"], b["gap"]
            grid_w = W * (0.80 if W > H else 0.86)
            cw = (grid_w - gap * (cols - 1)) / cols
            x0 = (W - grid_w) / 2.0
            for i, item in enumerate(b["items"]):
                r, c = divmod(i, cols)
                if cols == 2 and len(b["items"]) % 2 == 1 and i == len(b["items"]) - 1:
                    cx = W / 2.0
                else:
                    cx = x0 + c * (cw + gap) + cw / 2.0
                cy = b["top"] + r * (card_h + gap) + card_h / 2.0
                ti = t0 + 0.07 * i
                radius = float(ec.get("radius", 30)) * u
                shadow_col = mix(second, bg, 0.55)
                if ec.get("card_shadow") == "hard":
                    sh = f"\\xshad0\\yshad{7 * u:.1f}\\4c{ass_color(shadow_col)}\\4a&H00&"
                else:
                    sh = f"\\xshad0\\yshad{9 * u:.1f}\\4c{ass_color(shadow_col)}\\4a&H70&\\blur{6 * u:.1f}"
                tags = ("{\\an5" + anim_tags(anim, "card", cx, cy, end - ti, False)
                        + f"\\p1\\1c{ass_color(card_fill)}\\1a&H00&\\bord0" + sh + "}")
                doc.add(ti, end, tags + rounded_rect(cw, card_h, radius) + "{\\p0}", 50)
                val_col = accent if i % 2 == 0 else second
                if contrast(val_col, card_fill) < 1.8:
                    val_col = ink
                vlook = TextLook(font=disp, cap=min(72 * u, card_h * 0.32), fill=val_col, emph=val_col)
                vw = vlook.font.width(item["value"], vlook.size)
                if vw > cw * 0.86:
                    vlook = vlook.scaled(cw * 0.86 / vw)
                llook = TextLook(font=txt, cap=min(25 * u, card_h * 0.12), fill=second, emph=second)
                label = item.get("label", "")
                lw = llook.font.width(label, llook.size)
                if lw > cw * 0.88:
                    llook = llook.scaled(cw * 0.88 / lw)
                gap_v = card_h * 0.10
                stack = vlook.cap + (gap_v + llook.cap if label else 0)
                vtop = cy - stack / 2.0
                vy = line_centers(1, vlook, vtop, "top")[0]
                doc.add(ti, end, "{\\an5" + vlook.tags() + anim_tags(anim, "card", cx, vy, end - ti, False) + "}"
                        + escape(item["value"]), 51)
                if label:
                    ly = line_centers(1, llook, vtop + vlook.cap + gap_v, "top")[0]
                    doc.add(ti, end, "{\\an5" + llook.tags() + anim_tags(anim, "card", cx, ly, end - ti, False)
                            + "}" + escape(label), 51)
            delay += 0.07 * (len(b["items"]) - 1)
        elif k == "cta":
            on = on_color(accent, ink)
            look = TextLook(font=disp, cap=42 * u, fill=on, emph=on)
            text = b["text"]
            tw = look.font.width(text, look.size)
            w = min(W * 0.88, max(W * (0.42 if W > H else 0.80), tw + 2.6 * look.cap))
            if tw > w - 1.6 * look.cap:
                look = look.scaled((w - 1.6 * look.cap) / tw)
                tw = look.font.width(text, look.size)
            h = b["h"]
            cx, cy = W / 2.0, b["top"] + h / 2.0
            if ec.get("cta_shadow") == "hard":
                sh = f"\\xshad0\\yshad{8 * u:.1f}\\4c{ass_color(colors['accent_dark'])}\\4a&H00&"
            else:
                sh = f"\\xshad0\\yshad{8 * u:.1f}\\4c{ass_color(accent)}\\4a&H90&\\blur{10 * u:.1f}"
            pulse = "\\t(1350,1500,\\fscx104\\fscy104)\\t(1500,1680,\\fscx100\\fscy100)"
            doc.add(t0, end, "{\\an5" + anim_tags(anim, "card", cx, cy, end - t0, False) + pulse
                    + f"\\p1\\1c{ass_color(accent)}\\1a&H00&\\bord0" + sh + "}" + rounded_rect(w, h, h / 2.0)
                    + "{\\p0}", 52)
            asc, desc = look.font.asc_desc(look.size)
            top, bottom = look.font.ink(text, look.size)
            ty = cy - (asc - desc) / 2.0 - (top + bottom) / 2.0
            doc.add(t0, end, "{\\an5" + look.tags() + anim_tags(anim, "card", cx, ty, end - t0, False) + pulse + "}"
                    + escape(text), 53)
        delay += 0.10
    return logo_box
