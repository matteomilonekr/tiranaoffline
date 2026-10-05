"""The edit plan: draft creation from the transcripts (prepare) and anchor resolution (render)."""
from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional

from .common import WORK_DIRNAME, BCError, dumps_readable, read_json, say
from .captions import norm

OVERLAY_TYPES = {"hook", "opener", "title", "punch", "label", "broll", "image", "endcard"}
DEFAULT_DUR = {"hook": 2.6, "punch": 1.1, "label": 1.8, "broll": 2.5, "endcard": 3.2}


# ---------------------------------------------------------------- draft


def _similar(a: str, b: str) -> float:
    a = re.sub(r"~~.*?~~", "", a)
    wa, wb = [norm(x) for x in a.split()], [norm(x) for x in re.sub(r"~~.*?~~", "", b).split()]
    if len(wa) < 3:
        return 0.0
    return SequenceMatcher(a=wa, b=wb[: len(wa) + 2], autojunk=False).ratio()


def clip_kind(tr: dict, duration: float) -> str:
    words = tr.get("words") or []
    if len(words) < 4:
        return "visual"
    spoken = sum(s["end"] - s["start"] for s in tr.get("sentences") or [])
    return "speech" if spoken / max(0.1, duration) >= 0.30 else "visual"


def draft_clip(cid: str, clip: dict, tr: dict) -> dict:
    sents = []
    tsents = tr.get("sentences") or []
    words = tr.get("words") or []
    for k, s in enumerate(tsents):
        entry = {"id": f"{cid}.s{k + 1}", "t": [round(s["start"], 2), round(s["end"], 2)], "text": s["text"],
                 "keep": True}
        unsure = [w["w"].strip(".,!?;:") for w in words[s["w0"]:s["w1"]] if w.get("p", 1.0) < 0.5]
        if unsure:
            entry["note"] = "unsure words: " + ", ".join(unsure[:6])
        sents.append(entry)
    # false start inside one sentence: "I show you how… I show you how I edit" → cut the first take
    for e in sents:
        ws = e["text"].split()
        nw = [norm(w) for w in ws]
        for k in range(min(12, len(ws) // 2), 2, -1):
            if SequenceMatcher(a=nw[:k], b=nw[k:2 * k], autojunk=False).ratio() >= 0.8:
                e["text"] = "~~" + " ".join(ws[:k]) + "~~ " + " ".join(ws[k:])
                e["note"] = "; ".join(x for x in ("false start cut (~~…~~)", e.get("note")) if x)
                break
    # false starts: a sentence repeated (in full or almost) by the next one → keep the last take
    for k in range(len(sents) - 1):
        for j in (k + 1, k + 2):
            if j < len(sents) and _similar(sents[k]["text"], sents[j]["text"]) >= 0.75:
                sents[k]["keep"] = False
                sents[k]["note"] = "; ".join(x for x in (f"retake? repeated in {sents[j]['id']}", sents[k].get("note")) if x)
                break
    kind = clip_kind(tr, clip["duration"])
    out = {"id": cid, "file": clip["file"], "kind": kind, "duration": clip["duration"]}
    if clip["width"] > clip["height"] * 1.2:
        out["fit"] = "blur"
    out["sentences"] = sents
    return out


def build_plan(name: str, folder: Path, clips: List[dict], transcripts: Dict[str, dict], brand: dict,
               output: str) -> dict:
    langs = Counter(t.get("language") for t in transcripts.values() if t.get("language"))
    plan = {
        "version": 1,
        "name": name,
        "folder": str(folder),
        "output": output,
        "brand": brand.get("slug", "default"),
        "format": "9:16",
        "language": langs.most_common(1)[0][0] if langs else None,
        "settings": {"cut": "tight", "zoom_cuts": True, "captions": True},
        "clips": [draft_clip(f"c{i + 1}", c, transcripts[c["file"]]) for i, c in enumerate(clips)],
        "overlays": [],
    }
    if (brand.get("endcard") or {}).get("enabled", False):
        plan["overlays"].append({"type": "endcard"})
    return plan


def write_plan(path: Path, plan: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = path.with_suffix(".prev.json")
        backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    path.write_text(dumps_readable(plan) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- loading


def load_plan(path: Path) -> tuple:
    path = Path(path).expanduser().resolve()
    plan = read_json(path)
    if not isinstance(plan, dict) or not plan.get("clips"):
        raise BCError(f"{path.name} is not an edit plan (no clips).")
    folder = Path(plan.get("folder") or "")
    if not folder.is_dir():
        # plan.json lives in <folder>/.brand-captions/ or <folder>/.brand-captions/plans/
        for parent in path.parents:
            if parent.name == WORK_DIRNAME:
                folder = parent.parent
                break
    if not folder.is_dir():
        raise BCError("The clip folder of this plan was not found.", 'Set "folder" in the plan to the full path.')
    work = folder / WORK_DIRNAME
    ids = set()
    for c in plan["clips"]:
        if not c.get("id") or not c.get("file"):
            raise BCError("Every clip in the plan needs an \"id\" and a \"file\".")
        if c["id"] in ids:
            raise BCError(f'The clip id "{c["id"]}" is used twice in the plan.')
        ids.add(c["id"])
        if not (folder / c["file"]).exists():
            raise BCError(f'The clip "{c["file"]}" is not in the folder anymore.',
                          "Remove it from the plan or put the file back.")
    for i, ov in enumerate(plan.get("overlays") or []):
        if ov.get("type") not in OVERLAY_TYPES:
            raise BCError(f'Overlay #{i + 1} has an unknown type "{ov.get("type")}".',
                          "Use one of: hook, title, punch, label, broll, endcard.")
    return plan, folder, work


# ---------------------------------------------------------------- anchors


class Anchors:
    """Turns anchors like "start", "c2.s3", "c2.s3:word", "c2@4.5" or 12.3 into final-video seconds."""

    def __init__(self, timeline, sentences: Dict[str, dict], main_end: float):
        self.tl = timeline
        self.sent = sentences  # id -> {"clip", "start", "end", "keep", "tokens": [Token (source times)]}
        self.main_end = main_end

    def _sentence(self, sid: str) -> dict:
        s = self.sent.get(sid)
        if s is None:
            clip = sid.split(".")[0]
            ids = [k for k in self.sent if k.startswith(clip + ".")]
            hint = f"Sentences of {clip}: {ids[0]} … {ids[-1]}." if ids else f"There is no clip {clip}."
            raise BCError(f'The anchor "{sid}" does not exist.', hint)
        if not s.get("keep", True):
            raise BCError(f'The anchor "{sid}" points to a sentence that is cut out ("keep": false).',
                          "Anchor the overlay to a kept sentence.")
        return s

    def resolve(self, anchor, edge: str = "start") -> float:
        if anchor is None:
            raise BCError("An overlay has no time anchor.")
        if isinstance(anchor, (int, float)):
            return max(0.0, min(float(anchor), self.main_end))
        a = str(anchor).strip()
        if a == "start":
            return 0.0
        if a == "end":
            return self.main_end
        if re.fullmatch(r"-?\d+(\.\d+)?", a):
            return max(0.0, min(float(a), self.main_end))
        m = re.fullmatch(r"(c\d+)@(\d+(?:\.\d+)?)", a)
        if m:
            t = self.tl.to_out(m.group(1), float(m.group(2)))
            if t is None:
                raise BCError(f'The anchor "{a}" points to a clip that is not in the edit.')
            return t
        m = re.fullmatch(r"(c\d+)", a)
        if m:
            rng = self.tl.clip_range(a)
            if rng is None:
                raise BCError(f'The anchor "{a}" points to a clip that is not in the edit.')
            return rng[0] if edge == "start" else rng[1]
        m = re.fullmatch(r"(c\d+\.s\d+)(?::(.+))?", a)
        if m:
            s = self._sentence(m.group(1))
            word = m.group(2)
            if word:
                target = norm(word.split()[0])
                for tok in s["tokens"]:
                    if norm(tok.text) == target or (len(target) > 3 and norm(tok.text).startswith(target)):
                        t = tok.start if edge == "start" else tok.end
                        return self.tl.to_out(s["clip"], t)
                say(f'  ! word "{word}" not found in {m.group(1)}; using the sentence start.')
            t = s["start"] if edge == "start" else s["end"]
            return self.tl.to_out(s["clip"], t, prefer="next" if edge == "start" else "prev")
        raise BCError(f'The anchor "{a}" is not valid.',
                      'Use "start", "end", a number of seconds, "c1", "c1.s3", "c1.s3:word" or "c1@2.5".')

    def window(self, ov: dict, default_dur: float) -> tuple:
        kind = ov.get("type")
        start_anchor = ov.get("at", ov.get("from", "start"))
        start = self.resolve(start_anchor, "start")
        if ov.get("to") is not None:
            end = self.resolve(ov["to"], "end")
        elif ov.get("duration") is not None:
            end = start + float(ov["duration"])
        elif kind == "title":
            end = self.main_end
        elif kind in ("hook", "opener") and isinstance(start_anchor, str) and re.fullmatch(r"c\d+\.s\d+", start_anchor):
            end = self.resolve(start_anchor, "end") + 0.25
            end = min(max(end, start + 1.4), start + 4.0)
        elif kind == "punch" and isinstance(start_anchor, str) and ":" in start_anchor:
            end = max(start + 0.8, min(start + 1.6, self.resolve(start_anchor, "end") + 0.6))
        else:
            end = start + default_dur
        end = min(end, self.main_end)
        if end - start < 0.2:
            end = min(self.main_end, start + 0.6)
            if end - start < 0.2:
                start = max(0.0, end - 0.6)
        return start, end
