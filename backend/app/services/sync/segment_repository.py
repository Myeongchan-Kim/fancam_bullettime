from typing import Any, Dict, Iterable, List, Optional
from sqlalchemy.orm import Session

from app.models.models import ConcertSetlist, VideoSyncSegment


def find_setlist_match(
    setlists: Iterable[ConcertSetlist],
    m_start: float,
    m_end: float,
    min_overlap: float = 10.0,
) -> Optional[ConcertSetlist]:
    """
    Find the ConcertSetlist item with the largest timeline overlap >= `min_overlap` seconds
    within `[m_start, m_end]`.
    """
    ordered = sorted(
        [s for s in setlists if s.start_time is not None],
        key=lambda s: float(s.start_time),
    )
    best_item: Optional[ConcertSetlist] = None
    best_overlap = 0.0

    for idx, sl in enumerate(ordered):
        s_start = float(sl.start_time)
        s_end = (
            float(ordered[idx + 1].start_time)
            if idx + 1 < len(ordered)
            else s_start + 300.0
        )
        overlap = max(0.0, min(m_end, s_end) - max(m_start, s_start))
        if overlap > best_overlap:
            best_overlap = overlap
            best_item = sl

    return best_item if best_overlap >= min_overlap else None


def replace_video_segments(
    db: Session,
    video_id: int,
    segments_data: List[Dict[str, Any]],
    flush: bool = False,
) -> List[VideoSyncSegment]:
    """
    Atomically replace all `VideoSyncSegment` rows for `video_id` with `segments_data`.
    """
    db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()
    created: List[VideoSyncSegment] = []
    for item in segments_data:
        v_start = round(float(item["video_start_time"]), 2)
        v_end = round(float(item["video_end_time"]), 2)
        offset = round(float(item["sync_offset"]), 2)
        m_start = round(
            float(item.get("master_start_time", v_start + offset)), 2
        )
        m_end = round(
            float(item.get("master_end_time", v_end + offset)), 2
        )
        seg = VideoSyncSegment(
            video_id=video_id,
            video_start_time=v_start,
            video_end_time=v_end,
            master_start_time=m_start,
            master_end_time=m_end,
            sync_offset=offset,
            setlist_id=item.get("setlist_id"),
            label=item.get("label"),
            confidence=item.get("confidence", 1.0),
            is_verified=bool(item.get("is_verified", False)),
        )
        db.add(seg)
        created.append(seg)

    if flush:
        db.flush()
    return created
