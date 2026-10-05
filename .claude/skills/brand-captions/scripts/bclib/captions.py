"""Caption text: match edited sentences to the spoken word timings, then cut them into short chunks."""
from __future__ import annotations

import math
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Callable, List, Optional

from .ass import Token, apply_case
from .elements import clean_word, parse_marked

_EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF‍️]+")


def norm(word: str) -> str:
    w = unicodedata.normalize("NFKD", word.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^\w]", "", w)


def _spread(tokens: List[Token], s: float, e: float) -> None:
    total = sum(max(1, len(t.text)) for t in tokens) or 1
    t = s
    for tok in tokens:
        d = (e - s) * max(1, len(tok.text)) / total
        tok.start, tok.end = t, t + d
        t += d


def align(timed: List[dict], edited_text: Optional[str]) -> List[Token]:
    """Give each word of the (possibly corrected) sentence text the timing of the spoken words."""
    if edited_text is None:
        edited_text = " ".join(w["w"] for w in timed)
    toks = [t for line in parse_marked(_EMOJI.sub("", edited_text)) for t in line]
    if not timed:
        return []
    a = [norm(w["w"]) for w in timed]
    b = [norm(t.text) for t in toks]
    sm = SequenceMatcher(a=a, b=b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                toks[j1 + k].start, toks[j1 + k].end = timed[i1 + k]["s"], timed[i1 + k]["e"]
        elif tag == "replace":
            _spread(toks[j1:j2], timed[i1]["s"], timed[i2 - 1]["e"])
        elif tag == "insert":
            prev_e = timed[i1 - 1]["e"] if i1 > 0 else timed[0]["s"]
            next_s = timed[i1]["s"] if i1 < len(timed) else prev_e
            _spread(toks[j1:j2], prev_e, max(prev_e, next_s))
    return toks


def display_tokens(tokens: List[Token], case: Optional[str], punctuation: str) -> List[Token]:
    out = []
    for t in tokens:
        text = clean_word(apply_case(t.text, case), punctuation)
        if text.strip():
            out.append(Token(text, t.emph, t.start, t.end))
    return out


FUNCTION_WORDS = set("""
il lo la i gli le un una uno di da del della dei delle in con su per tra fra a al alla ai e o ma che non se mi ti ci si
the a an of to in on at for with and or but is are be my your our this that
de het een van en in op met voor aan te om dat die dit je mijn
der die das ein eine und oder mit von zu im am für den dem des
le la les un une des de du et ou en au aux pour avec sur dans
el la los las un una de del y o en con por para al que
""".split())

_HARD_END = re.compile(r"[.!?…:;]['\"»”’)]*$")
_COMMA = re.compile(r"[,–—]['\"»”’)]*$")


def _best_split(ph: List[Token], n: int, max_words: int, fits: Callable[[List[Token]], bool]) -> List[List[Token]]:
    """Split one phrase into n chunks: even sizes, no chunk ending on 'the/di/een…', every chunk fits."""
    L = len(ph)
    best = None

    def rec(i: int, left: int, sizes: list):
        nonlocal best
        if left == 1:
            size = L - i
            if 1 <= size <= max(max_words, 1) or (size > max_words and n >= L):
                cand = sizes + [size]
                parts, j = [], 0
                for sz in cand:
                    parts.append(ph[j:j + sz])
                    j += sz
                avg = L / n
                cost = sum((len(p) - avg) ** 2 for p in parts)
                cost += sum(3 for p in parts[:-1] if norm(p[-1].text) in FUNCTION_WORDS)
                cost += sum(100 for p in parts if len(p) > 1 and not fits(p))
                if best is None or cost < best[0]:
                    best = (cost, parts)
            return
        for size in range(1, max_words + 1):
            if i + size < L:
                rec(i + size, left - 1, sizes + [size])

    rec(0, n, [])
    return best[1] if best else [ph]


def chunk(tokens: List[Token], sentence_starts: set, fits: Callable[[List[Token]], bool], max_words: int) -> List[dict]:
    """Group words into short captions that are easy to read in one glance."""
    phrases: List[List[Token]] = []
    cur: List[Token] = []
    for i, tok in enumerate(tokens):
        if cur and (i in sentence_starts or tok.start - cur[-1].end > 0.45 or _HARD_END.search(cur[-1].text)
                    or (_COMMA.search(cur[-1].text) and len(cur) >= 2)):
            phrases.append(cur)
            cur = []
        cur.append(tok)
    if cur:
        phrases.append(cur)
    out: List[dict] = []
    for ph in phrases:
        n = max(1, math.ceil(len(ph) / max_words))
        while True:
            parts = _best_split(ph, n, max_words, fits) if n > 1 else [ph]
            if all(len(p) == 1 or fits(p) for p in parts) or n >= len(ph):
                break
            n += 1
        for p in parts:
            out.append({"tokens": list(p), "start": p[0].start, "end": p[-1].end})
    # glue a lonely tiny word (e.g. "ok", "sì") to the previous caption when it fits
    merged: List[dict] = []
    for ch in out:
        if (merged and len(ch["tokens"]) == 1 and len(ch["tokens"][0].text) <= 3
                and ch["start"] - merged[-1]["end"] < 0.25 and fits(merged[-1]["tokens"] + ch["tokens"])
                and not _HARD_END.search(merged[-1]["tokens"][-1].text)):
            merged[-1]["tokens"] += ch["tokens"]
            merged[-1]["end"] = ch["end"]
        else:
            merged.append(ch)
    return merged


def time_chunks(chunks: List[dict], hold: float = 0.25, bridge: float = 0.6, min_dur: float = 0.35) -> None:
    for i, ch in enumerate(chunks):
        nxt = chunks[i + 1]["start"] if i + 1 < len(chunks) else None
        end = ch["end"]
        if nxt is not None and nxt - end < bridge:
            end = nxt
        else:
            end = end + hold if nxt is None else min(end + hold, nxt - 0.04)
        if end - ch["start"] < min_dur:
            end = ch["start"] + min_dur if nxt is None else min(ch["start"] + min_dur, max(nxt, ch["start"] + 0.1))
        ch["end"] = end


def hide_windows(chunks: List[dict], windows: List[tuple]) -> List[dict]:
    """Remove (or shorten) captions that would sit under an overlay that replaces them."""
    out = []
    for ch in chunks:
        s, e = ch["start"], ch["end"]
        keep = True
        for ws, we in windows:
            ov = min(e, we) - max(s, ws)
            if ov <= 0:
                continue
            if ov >= 0.5 * (e - s) or (ws <= s and we >= e):
                keep = False
                break
            if ws <= s:
                s = we
            else:
                e = ws
        if keep and e - s >= 0.2:
            out.append(dict(ch, start=s, end=e))
    return out
