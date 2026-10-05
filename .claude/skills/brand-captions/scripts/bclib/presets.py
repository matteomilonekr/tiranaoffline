"""Style presets: how captions and text elements look for each brand personality.

Sizes are capital-letter heights in pixels on a 1080-pixel-wide frame, so they look
the same whatever font is used. Stroke/shadow sizes are fractions of the capital height.
"""
from __future__ import annotations

import copy

from .common import contrast, mix, parse_color, readable_on

PRESETS = {
    # Rounded heavy type, white with thick dark outline and hard shadow, punchy pops (e.g. Swubie).
    "playful": {
        "case": "as-is", "punctuation": "keep", "anim": "pop", "highlight": "keywords",
        "caption": {"font": "display", "cap": 44, "fill": "text", "emph": "accent", "stroke": "stroke",
                    "stroke_w": 0.17, "shadow": "hard", "shadow_color": "stroke", "shadow_y": 0.13,
                    "max_words": 3, "y": 0.705, "width": 0.86},
        "hook": {"font": "display", "cap": 74, "fill": "text", "emph": "accent", "stroke": "stroke",
                 "stroke_w": 0.13, "shadow": "hard", "shadow_color": "stroke", "shadow_y": 0.14,
                 "y": 0.60, "width": 0.84},
        "title": {"font": "display", "cap": 46, "fill": "text", "emph": "accent", "stroke": "stroke",
                  "stroke_w": 0.15, "shadow": "hard", "shadow_color": "stroke", "shadow_y": 0.12,
                  "y": 0.10, "width": 0.86},
        "punch": {"font": "display", "cap": 132, "fill": "accent", "emph": "secondary", "stroke": "stroke",
                  "stroke_w": 0.10, "shadow": "hard", "shadow_color": "stroke", "shadow_y": 0.10,
                  "y": 0.45, "width": 0.88},
        "label": {"font": "display", "cap": 52, "fill": "on_secondary", "box": "secondary", "border": "#FFFFFF",
                  "border_w": 0.13, "shadow": "hard", "shadow_color": "stroke", "shadow_y": 0.12,
                  "radius": 1.0, "pad_x": 1.25, "pad_y": 0.72, "case": "upper", "y": 0.30},
        "endcard": {"radius": 34, "card_shadow": "soft", "cta_shadow": "hard"},
    },
    # Modern grotesk, lowercase, no outline, soft shadow, calm rise animation (e.g. AI Build Lab).
    "clean": {
        "case": "lower", "punctuation": "minimal", "anim": "rise", "highlight": "keywords",
        "caption": {"font": "text", "cap": 37, "fill": "text", "emph": "accent", "stroke": None,
                    "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.10, "shadow_alpha": 0.62,
                    "max_words": 4, "y": 0.69, "width": 0.80},
        "hook": {"font": "text", "cap": 50, "fill": "text", "emph": "accent", "stroke": None, "shadow": "soft",
                 "shadow_color": "#000000", "shadow_y": 0.10, "shadow_alpha": 0.62, "y": 0.45, "width": 0.80},
        "title": {"font": "text", "cap": 40, "fill": "text", "emph": "accent", "stroke": None, "shadow": "soft",
                  "shadow_color": "#000000", "shadow_y": 0.10, "shadow_alpha": 0.62, "y": 0.085, "width": 0.80},
        "punch": {"font": "display", "cap": 100, "fill": "accent", "emph": "text", "stroke": None,
                  "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.08, "shadow_alpha": 0.5,
                  "y": 0.45, "width": 0.84},
        "label": {"font": "text", "cap": 36, "fill": "on_accent", "box": "accent", "border": None,
                  "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.10, "shadow_alpha": 0.35,
                  "radius": 0.35, "pad_x": 0.95, "pad_y": 0.62, "case": None, "y": 0.30},
        "endcard": {"radius": 28, "card_shadow": "soft", "cta_shadow": "soft"},
    },
    # Heavy uppercase, black outline, the word being spoken lights up (talking-head "viral" style).
    "bold": {
        "case": "upper", "punctuation": "minimal", "anim": "snap", "highlight": "active",
        "caption": {"font": "display", "cap": 54, "fill": "text", "emph": "accent", "stroke": "#000000",
                    "stroke_w": 0.18, "shadow": "hard", "shadow_color": "#000000", "shadow_y": 0.10,
                    "max_words": 3, "y": 0.66, "width": 0.88},
        "hook": {"font": "display", "cap": 78, "fill": "text", "emph": "accent", "stroke": "#000000",
                 "stroke_w": 0.14, "shadow": "hard", "shadow_color": "#000000", "shadow_y": 0.10,
                 "y": 0.42, "width": 0.88},
        "title": {"font": "display", "cap": 48, "fill": "text", "emph": "accent", "stroke": "#000000",
                  "stroke_w": 0.16, "shadow": "hard", "shadow_color": "#000000", "shadow_y": 0.10,
                  "y": 0.10, "width": 0.88},
        "punch": {"font": "display", "cap": 150, "fill": "accent", "emph": "text", "stroke": "#000000",
                  "stroke_w": 0.10, "shadow": "hard", "shadow_color": "#000000", "shadow_y": 0.08,
                  "y": 0.42, "width": 0.90},
        "label": {"font": "display", "cap": 42, "fill": "on_accent", "box": "accent", "border": "#000000",
                  "border_w": 0.12, "shadow": "hard", "shadow_color": "#000000", "shadow_y": 0.12,
                  "radius": 0.22, "pad_x": 0.9, "pad_y": 0.6, "case": "upper", "y": 0.30},
        "endcard": {"radius": 18, "card_shadow": "hard", "cta_shadow": "hard"},
    },
    # Serif or refined type, soft shadow, gentle fades (beauty, fashion, food, hospitality).
    "elegant": {
        "case": "as-is", "punctuation": "keep", "anim": "fade", "highlight": "keywords",
        "caption": {"font": "text", "cap": 32, "fill": "text", "emph": "accent", "stroke": None,
                    "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.08, "shadow_alpha": 0.6,
                    "max_words": 5, "y": 0.70, "width": 0.80},
        "hook": {"font": "display", "cap": 56, "fill": "text", "emph": "accent", "stroke": None, "shadow": "soft",
                 "shadow_color": "#000000", "shadow_y": 0.08, "shadow_alpha": 0.6, "y": 0.45, "width": 0.80},
        "title": {"font": "display", "cap": 44, "fill": "text", "emph": "accent", "stroke": None,
                  "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.08, "shadow_alpha": 0.6,
                  "y": 0.09, "width": 0.80},
        "punch": {"font": "display", "cap": 104, "fill": "text", "emph": "accent", "stroke": None,
                  "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.08, "shadow_alpha": 0.6,
                  "y": 0.45, "width": 0.84},
        "label": {"font": "text", "cap": 30, "fill": "ink", "box": "background", "border": None,
                  "shadow": "soft", "shadow_color": "#000000", "shadow_y": 0.10, "shadow_alpha": 0.3,
                  "radius": 1.0, "pad_x": 1.1, "pad_y": 0.7, "case": None, "y": 0.30},
        "endcard": {"radius": 24, "card_shadow": "soft", "cta_shadow": "soft"},
    },
}

DEFAULT_COLORS = {"text": "#FFFFFF", "stroke": "#111111", "accent": "#FFD23F", "secondary": "#2F6BFF",
                  "background": "#F6F4EF", "ink": "#151515"}

ELEMENTS = ("caption", "hook", "title", "punch", "label")


def full_colors(colors: dict) -> dict:
    c = dict(DEFAULT_COLORS)
    for k, v in (colors or {}).items():
        pv = parse_color(v)
        if pv:
            c[k] = pv
    c.setdefault("ink", "#151515")
    c["on_accent"] = on_color(c["accent"], c["ink"])
    c["on_secondary"] = on_color(c["secondary"], c["ink"])
    c["on_background"] = readable_on(c["background"], "#FFFFFF", c["ink"])
    c["accent_dark"] = mix(c["accent"], "#000000", 0.22)
    c["secondary_dark"] = mix(c["secondary"], "#000000", 0.25)
    return c


def on_color(bg: str, ink: str = "#111111") -> str:
    """Text colour for a filled shape: white whenever it is readable at large bold sizes."""
    if contrast(bg, "#FFFFFF") >= 2.0:
        return "#FFFFFF"
    return ink if contrast(bg, ink) >= 3.0 else "#111111"


def color_of(value, colors: dict):
    if value is None:
        return None
    if isinstance(value, str) and value in colors:
        return colors[value]
    return parse_color(value)


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def resolve_style(brand: dict, settings: dict) -> dict:
    """Concrete style for every element: preset ← brand overrides ← plan settings."""
    name = brand.get("style") if brand.get("style") in PRESETS else "clean"
    st = deep_merge(PRESETS[name], brand.get("overrides") or {})
    st["preset"] = name
    for key in ("case", "punctuation", "anim", "highlight"):
        if brand.get(key):
            st[key] = brand[key]
    settings = settings or {}
    for key in ("case", "punctuation", "anim", "highlight"):
        if settings.get(key):
            st[key] = settings[key]
    if settings.get("caption_size"):
        st["caption"]["cap"] = st["caption"]["cap"] * float(settings["caption_size"])
    if settings.get("caption_y"):
        st["caption"]["y"] = float(settings["caption_y"])
    if settings.get("max_words"):
        st["caption"]["max_words"] = int(settings["max_words"])
    st["colors"] = full_colors(brand.get("colors") or {})
    return st
