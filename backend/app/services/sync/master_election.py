from typing import Iterable, List, Optional
from sqlalchemy.orm import Session

from app.models.models import Video


def elect_master_video(
    db: Optional[Session],
    concert_id: Optional[int] = None,
    videos: Optional[Iterable[Video]] = None,
    min_master_duration: float = 3600.0,
    exclude_video_id: Optional[int] = None,
    fallback_to_any: bool = False,
) -> Optional[Video]:
    """
    Unified Master Concert Video Election Policy.

    Priority order:
    1. Explicit `calibration_status == 'master'` (longest if multiple)
    2. Full concert recording (`duration > min_master_duration`) with `sync_offset == 0.0` (longest first)
    3. Longest full concert recording (`duration > min_master_duration`)
    4. Longest available video in the concert when `fallback_to_any` is True
    """
    if videos is not None:
        candidates: List[Video] = [
            v for v in videos
            if getattr(v, "is_unavailable", False) is not True
            and (exclude_video_id is None or getattr(v, "id", None) != exclude_video_id)
        ]
    elif db is not None and concert_id is not None:
        query = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.is_unavailable == False,
            Video.duration > min_master_duration,
        )
        if exclude_video_id is not None:
            query = query.filter(Video.id != exclude_video_id)

        first_candidate = query.order_by(Video.duration.desc()).first()
        raw_all = query.all()
        if isinstance(raw_all, list) and len(raw_all) > 0:
            candidates = raw_all
        elif first_candidate is not None:
            return first_candidate
        elif fallback_to_any:
            fb_q = db.query(Video).filter(
                Video.concert_id == concert_id,
                Video.is_unavailable == False,
            )
            if exclude_video_id is not None:
                fb_q = fb_q.filter(Video.id != exclude_video_id)
            return fb_q.order_by(Video.duration.desc()).first()
        else:
            return None
    else:
        return None

    if not candidates:
        return None

    explicit_masters = [
        v for v in candidates if getattr(v, "calibration_status", None) == "master"
    ]
    if explicit_masters:
        return max(explicit_masters, key=lambda v: float(v.duration or 0.0))

    long_videos = [
        v for v in candidates if v.duration is not None and float(v.duration) > min_master_duration
    ]
    if long_videos:
        long_videos.sort(
            key=lambda v: (
                0 if (getattr(v, "sync_offset", None) is not None and isinstance(v.sync_offset, (int, float)) and abs(float(v.sync_offset)) < 1e-6) else 1,
                -float(v.duration or 0.0),
            )
        )
        return long_videos[0]

    if fallback_to_any and candidates:
        return max(candidates, key=lambda v: float(v.duration or 0.0))

    return None
