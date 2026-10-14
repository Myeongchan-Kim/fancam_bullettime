import re
from typing import Optional, Union
from urllib.parse import urlparse, parse_qs

_YOUTUBE_ID_PATTERN = re.compile(r"^[0-9A-Za-z_-]{11}$")
_YOUTUBE_URL_REGEX = re.compile(
    r"(?:v=|youtu\.be/|/embed/|/v/|/shorts/|/live/)([0-9A-Za-z_-]{11})"
)


def get_video_id(url: str) -> Optional[str]:
    """
    Extract the 11-character YouTube video ID from various YouTube URL formats
    or a raw 11-character ID string.
    """
    if not url or not isinstance(url, str):
        return None

    cleaned = url.strip()
    if _YOUTUBE_ID_PATTERN.match(cleaned):
        return cleaned

    try:
        parsed = urlparse(cleaned)
        if parsed.hostname == "youtu.be":
            candidate = parsed.path.lstrip("/").split("/")[0]
            if _YOUTUBE_ID_PATTERN.match(candidate):
                return candidate
        if parsed.hostname and ("youtube.com" in parsed.hostname or "youtube-nocookie.com" in parsed.hostname):
            if parsed.path == "/watch":
                qs = parse_qs(parsed.query)
                if "v" in qs and qs["v"]:
                    candidate = qs["v"][0][:11]
                    if _YOUTUBE_ID_PATTERN.match(candidate):
                        return candidate
            for prefix in ("/embed/", "/v/", "/shorts/", "/live/"):
                if parsed.path.startswith(prefix):
                     parts = parsed.path.split("/")
                     if len(parts) >= 3 and _YOUTUBE_ID_PATTERN.match(parts[2][:11]):
                         return parts[2][:11]
    except Exception:
        pass

    match = _YOUTUBE_URL_REGEX.search(cleaned)
    if match:
        return match.group(1)

    fallback_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", cleaned)
    if fallback_match:
        return fallback_match.group(1)

    return None


def timestamp_to_seconds(ts: Union[str, int, float]) -> float:
    """
    Convert a timestamp string ('HH:MM:SS', 'MM:SS', or 'SS') or number into seconds.
    """
    if ts is None:
        return 0.0
    if isinstance(ts, (int, float)):
        return float(ts)
    if not isinstance(ts, str):
        return 0.0

    cleaned = ts.strip()
    if not cleaned:
        return 0.0

    try:
        parts = [float(p) for p in cleaned.split(":")]
        if len(parts) == 3:
            return parts[0] * 3600.0 + parts[1] * 60.0 + parts[2]
        elif len(parts) == 2:
            return parts[0] * 60.0 + parts[1]
        elif len(parts) == 1:
            return parts[0]
    except (ValueError, TypeError):
        pass
    return 0.0
