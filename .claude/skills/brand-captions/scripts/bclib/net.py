"""Small HTTP helper (standard library only, certifi when available)."""
from __future__ import annotations

import gzip
import ssl
import urllib.error
import urllib.request
import zlib
from typing import Optional, Tuple

from .common import BCError

BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/126.0 Safari/537.36")


def _context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def http_get(url: str, ua: str = BROWSER_UA, timeout: float = 25, max_bytes: int = 12_000_000,
             accept: Optional[str] = None) -> Tuple[bytes, str, str]:
    """Return (body, final_url, content_type). Raises BCError with a plain message."""
    headers = {"User-Agent": ua, "Accept-Encoding": "gzip, deflate", "Accept-Language": "en,it;q=0.8"}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_context()) as resp:
            body = resp.read(max_bytes + 1)
            enc = (resp.headers.get("Content-Encoding") or "").lower()
            if enc == "gzip":
                body = gzip.decompress(body)
            elif enc == "deflate":
                body = zlib.decompress(body)
            return body[:max_bytes], resp.geturl(), resp.headers.get("Content-Type") or ""
    except urllib.error.HTTPError as e:
        raise BCError(f"The address {url} answered with error {e.code}.", detail=str(e))
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise BCError(f"Could not reach {url}.", "Check the address and the internet connection.", detail=str(e))
