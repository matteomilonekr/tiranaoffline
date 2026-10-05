"""Building blocks for the ASS subtitle file that libass burns into the video.

Every line of text is placed explicitly (one event per line) so line spacing, ink
centring and animations are fully under our control and identical on every computer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from .common import hex_to_rgb
from .fonts import Font

KAPPA = 0.5523  # bezier circle approximation


def ass_color(hex_color: str) -> str:
    r, g, b = hex_to_rgb(hex_color)
    return f"&H{b:02X}{g:02X}{r:02X}&"


def ass_alpha(opacity: float) -> str:
    a = int(round(255 * (1.0 - max(0.0, min(1.0, opacity)))))
    return f"&H{a:02X}&"


def ass_time(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def escape(text: str) -> str:
    return text.replace("\\", "∖").replace("{", "(").replace("}", ")").replace("\n", " ")


def rounded_rect(w: float, h: float, r: float) -> str:
    r = max(0.0, min(r, w / 2.0, h / 2.0))
    k = r * KAPPA
    pts = [("m", [(r, 0)]), ("l", [(w - r, 0)]), ("b", [(w - r + k, 0), (w, r - k), (w, r)]),
           ("l", [(w, h - r)]), ("b", [(w, h - r + k), (w - r + k, h), (w - r, h)]), ("l", [(r, h)]),
           ("b", [(r - k, h), (0, h - r + k), (0, h - r)]), ("l", [(0, r)]), ("b", [(0, r - k), (r - k, 0), (r, 0)])]
    return " ".join(cmd + " " + " ".join(f"{round(x)} {round(y)}" for x, y in p) for cmd, p in pts)


@dataclass
class TextLook:
    """Resolved look of a piece of text (all sizes in pixels)."""
    font: Font
    cap: float
    fill: str
    emph: str
    stroke: Optional[str] = None
    stroke_w: float = 0.0
    shadow: Optional[str] = None  # "hard" | "soft" | None
    shadow_color: str = "#000000"
    shadow_x: float = 0.0
    shadow_y: float = 0.0
    shadow_alpha: float = 1.0
    spacing: float = 0.0

    @property
    def size(self) -> float:
        return self.font.size_for_cap(self.cap)

    @property
    def pitch(self) -> float:
        """Distance between baselines of consecutive lines."""
        return self.cap * 1.42

    def scaled(self, k: float) -> "TextLook":
        import copy
        t = copy.copy(self)
        t.cap *= k
        t.stroke_w *= k
        t.shadow_x *= k
        t.shadow_y *= k
        return t

    def tags(self) -> str:
        """Override tags for font, colours, border and shadow."""
        out = [f"\\fn{self.font.ass_name}", f"\\fs{self.size:.1f}", f"\\fsp{self.spacing:.1f}",
               f"\\1c{ass_color(self.fill)}", "\\1a&H00&"]
        if self.shadow == "soft":
            glow = max(1.0, self.cap * 0.06) + (self.stroke_w if self.stroke else 0)
            out += [f"\\bord{glow:.1f}", f"\\3c{ass_color(self.stroke or self.shadow_color)}",
                    f"\\3a{ass_alpha(1.0 if self.stroke else self.shadow_alpha * 0.75)}",
                    f"\\blur{max(2.0, self.cap * 0.16):.1f}",
                    f"\\xshad{self.shadow_x:.1f}", f"\\yshad{max(1.0, self.shadow_y):.1f}",
                    f"\\4c{ass_color(self.shadow_color)}", f"\\4a{ass_alpha(self.shadow_alpha)}"]
        else:
            out += [f"\\bord{self.stroke_w if self.stroke else 0:.1f}",
                    f"\\3c{ass_color(self.stroke or '#000000')}", "\\3a&H00&", "\\blur0.6" if self.stroke else "\\blur0"]
            if self.shadow == "hard":
                out += [f"\\xshad{self.shadow_x:.1f}", f"\\yshad{self.shadow_y:.1f}",
                        f"\\4c{ass_color(self.shadow_color)}", f"\\4a{ass_alpha(self.shadow_alpha)}"]
            else:
                out += ["\\shad0"]
        return "".join(out)

    def alphas(self) -> tuple:
        """(\\1a, \\3a, \\4a) values for a fully visible word."""
        if self.shadow == "soft":
            return ("&H00&", ass_alpha(1.0 if self.stroke else self.shadow_alpha * 0.75), ass_alpha(self.shadow_alpha))
        return ("&H00&", "&H00&", ass_alpha(self.shadow_alpha) if self.shadow == "hard" else "&HFF&")


@dataclass
class Token:
    text: str
    emph: bool = False
    start: float = 0.0  # seconds (output timeline)
    end: float = 0.0
    cut: bool = False   # ~~struck~~ in the plan: removed from the video and the captions


@dataclass
class Event:
    start: float
    end: float
    text: str
    layer: int = 0


@dataclass
class Doc:
    width: int
    height: int
    events: List[Event] = field(default_factory=list)

    def add(self, start: float, end: float, text: str, layer: int = 0) -> None:
        if end - start >= 0.02:
            self.events.append(Event(start, end, text, layer))

    def dumps(self) -> str:
        head = (
            "[Script Info]\nScriptType: v4.00+\n"
            f"PlayResX: {self.width}\nPlayResY: {self.height}\n"
            "WrapStyle: 2\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Default,Montserrat ExtraBold,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
            "0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        lines = [f"Dialogue: {e.layer},{ass_time(e.start)},{ass_time(e.end)},Default,,0,0,0,,{e.text}"
                 for e in sorted(self.events, key=lambda e: (e.start, e.layer))]
        return head + "\n".join(lines) + "\n"


# ---------------------------------------------------------------- animation


def ms(t: float) -> int:
    return int(round(t * 1000))


def anim_tags(kind: str, role: str, x: float, y: float, dur: float, exit_fade: bool = True) -> str:
    """Position + entrance/exit animation override tags for one event."""
    d = ms(dur)
    fo = 110 if exit_fade else 0
    if kind == "pop":
        prof = {"caption": (80, 106, 0), "hook": (55, 108, 98), "punch": (0, 118, 94),
                "label": (40, 112, 97), "title": (80, 105, 0), "card": (60, 106, 0)}.get(role, (70, 108, 0))
        s0, s1, s2 = prof
        t1, t2, t3 = (90, 170, 240) if role == "caption" else (140, 230, 320)
        tags = f"\\pos({x:.1f},{y:.1f})\\fscx{s0}\\fscy{s0}\\t(0,{t1},\\fscx{s1}\\fscy{s1})"
        if s2:
            tags += f"\\t({t1},{t2},\\fscx{s2}\\fscy{s2})\\t({t2},{t3},\\fscx100\\fscy100)"
        else:
            tags += f"\\t({t1},{t2},\\fscx100\\fscy100)"
        fi = 40 if role == "caption" else 70
        if exit_fade and role in ("punch", "label", "hook"):
            tags += f"\\t({max(0, d - fo)},{d},\\fscx88\\fscy88)"
        return tags + f"\\fad({fi},{fo})"
    if kind == "rise":
        dy = {"caption": 14, "hook": 26, "punch": 22, "label": 14, "title": 18, "card": 22}.get(role, 18)
        t = 160 if role == "caption" else 260
        tags = f"\\move({x:.1f},{y + dy:.1f},{x:.1f},{y:.1f},0,{t})"
        if role == "punch":
            tags += f"\\fscx92\\fscy92\\t(0,{t},0.6,\\fscx100\\fscy100)"
        return tags + f"\\fad({t},{fo})"
    if kind == "snap":
        s0 = {"punch": 140, "hook": 118, "label": 125}.get(role, 115)
        t = 110 if role == "caption" else 160
        return f"\\pos({x:.1f},{y:.1f})\\fscx{s0}\\fscy{s0}\\t(0,{t},0.5,\\fscx100\\fscy100)\\fad(0,{fo})"
    # fade
    t = 140 if role == "caption" else 260
    return f"\\pos({x:.1f},{y:.1f})\\fad({t},{fo + 60 if exit_fade else 0})"


# ---------------------------------------------------------------- text layout


def apply_case(text: str, case: Optional[str]) -> str:
    if case == "upper":
        return text.upper()
    if case == "lower":
        return text.lower()
    return text


def split_lines(tokens: Sequence[Token], look: TextLook, max_width: float, max_lines: int = 2) -> List[List[Token]]:
    """Balanced line breaking: fewest lines that fit, then the most even widths."""
    n = len(tokens)
    if n == 0:
        return []
    w = [look.font.width(t.text, look.size, look.spacing) for t in tokens]
    sp = look.font.width(" ", look.size, look.spacing)

    def width(i: int, j: int) -> float:
        return sum(w[i:j]) + sp * max(0, j - i - 1)

    if width(0, n) <= max_width or n == 1:
        return [list(tokens)]
    best = None
    for lines in range(2, max_lines + 1):
        cands = []
        if lines == 2:
            for a in range(1, n):
                cands.append([(0, a), (a, n)])
        else:
            for a in range(1, n - 1):
                for b in range(a + 1, n):
                    cands.append([(0, a), (a, b), (b, n)])
        for c in cands:
            widths = [width(i, j) for i, j in c]
            # prefer: fits, balanced, last line not shorter than the first (pyramid)
            score = (max(widths) > max_width, max(widths) - min(widths) * 0.15 + (25 if widths[-1] < widths[0] * 0.6 else 0))
            if best is None or score < best[0]:
                best = (score, c)
        if best and not best[0][0]:
            break
    return [list(tokens[i:j]) for i, j in best[1]]


def block_width(lines: List[List[Token]], look: TextLook) -> float:
    sp = look.font.width(" ", look.size, look.spacing)
    return max((sum(look.font.width(t.text, look.size, look.spacing) for t in ln) + sp * (len(ln) - 1))
               for ln in lines) if lines else 0.0


def line_centers(n_lines: int, look: TextLook, anchor_y: float, valign: str = "middle") -> List[float]:
    """\\an5 y positions for each line so the ink block is centred (or top-aligned) at anchor_y."""
    asc, desc = look.font.asc_desc(look.size)
    ink_h = look.cap + (n_lines - 1) * look.pitch
    top = anchor_y - ink_h / 2.0 if valign == "middle" else anchor_y
    out = []
    for i in range(n_lines):
        baseline = top + look.cap + i * look.pitch
        out.append(baseline - (asc - desc) / 2.0)
    return out


def token_runs(tokens: Sequence[Token], look: TextLook, t0: float, mode: str = "static",
               active_color: Optional[str] = None, stagger: float = 0.0, first_index: int = 0) -> str:
    """ASS text for one line. mode: static | active (spoken word lights up) | reveal (words appear).

    stagger > 0 makes words appear one after the other (first_index = words in earlier lines).
    """
    parts = []
    a1, a3, a4 = look.alphas()
    for j, tok in enumerate(tokens):
        i = first_index + j
        base = look.emph if tok.emph else look.fill
        tags = f"\\1c{ass_color(base)}"
        if mode == "active" and active_color:
            s, e = ms(tok.start - t0), ms(tok.end - t0)
            if s > 0:
                tags += f"\\t({s},{s + 1},\\1c{ass_color(active_color)})"
            else:
                tags = f"\\1c{ass_color(active_color)}"
            tags += f"\\t({max(e, s + 2)},{max(e, s + 2) + 1},\\1c{ass_color(base)})"
        elif mode == "reveal":
            s = ms(tok.start - t0)
            if s > 0:
                tags += f"\\1a&HFF&\\3a&HFF&\\4a&HFF&\\t({s},{s + 60},\\1a{a1}\\3a{a3}\\4a{a4})"
        elif stagger > 0 and i > 0:
            s = ms(stagger * i)
            tags += f"\\1a&HFF&\\3a&HFF&\\4a&HFF&\\t({s},{s + 120},\\1a{a1}\\3a{a3}\\4a{a4})"
        parts.append("{" + tags + "}" + escape(tok.text))
    return " ".join(parts)
