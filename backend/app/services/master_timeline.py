"""
Master Timeline Management Service
-----------------------------------
Handles safe replacement/swapping of the canonical Master Video for a concert
while maintaining the invariant Abstract Timeline T=0 coordinate system.

Architecture:
1. Low-Level Acoustic Sensor:
   - Uses `recursive_segment_probe` (app.crawler.recursive_segment_calibrator)
     to detect cuts between Old and New Master via binary divide-and-conquer.
2. Coordinate Warping:
   - `PiecewiseTimelineTransform` maps any timestamp t_old -> T_master.
3. Domain Orchestration:
   - `replace_master_timeline()`:
     a. Upgrades New Master to canonical status (`master`, offset=0.0).
     b. Demotes Old Master to segmented multi-angle video (`split_segmented`).
     c. Projects all `ConcertSetlist` track timestamps to New Master frame.
     d. Preserves parent-child sync tree relationships for existing child fancams.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from app.services.calibration import record_video_calibration, cascade_update_children_offsets

logger = logging.getLogger(__name__)


class PiecewiseTimelineTransform:
    """
    Mathematical piecewise coordinate transform between two video timelines.
    Given a list of continuous segments with local sync offsets,
    maps timestamps from Target (Old Master) to Reference (New Master).
    """
    def __init__(self, segments: List[Dict[str, Any]]):
        if not segments:
            raise ValueError("PiecewiseTimelineTransform requires at least one segment.")
        self.segments = sorted(segments, key=lambda s: s["video_start_time"])

    def transform(self, t_target: float) -> float:
        """
        Maps t_target in old master to T_master in new master timeline.
        If t_target falls inside a segment, uses that segment's offset.
        If outside (e.g. slight boundary overshoot), uses the closest segment's offset.
        """
        for seg in self.segments:
            if seg["video_start_time"] <= t_target <= seg["video_end_time"]:
                return round(t_target + seg["sync_offset"], 2)

        # Fallback to nearest segment for boundary points
        closest = min(
            self.segments,
            key=lambda s: min(abs(s["video_start_time"] - t_target), abs(s["video_end_time"] - t_target))
        )
        return round(t_target + closest["sync_offset"], 2)


def replace_master_timeline(
    db: Session,
    concert_id: int,
    new_master_id: int,
    old_master_id: Optional[int] = None,
    segments: Optional[List[Dict[str, Any]]] = None,
    old_master_chapters: Optional[List[Tuple[float, str]]] = None,
    dry_run: bool = True
) -> Dict[str, Any]:
    """
    Orchestrates the replacement of the canonical Master Video for a concert.

    Args:
        db: SQLAlchemy session
        concert_id: Target concert ID
        new_master_id: ID of the new uncut Master Video (e.g. #1094)
        old_master_id: ID of the old Master Video (e.g. #63). If None, automatically
                       locates the current master for the concert.
        segments: Optional pre-computed segment mapping. If None, computes segments
                  dynamically via low-level acoustic probe.
        old_master_chapters: Optional raw (timestamp, title) list from old master description.
                             If omitted, parses from old master's description.
        dry_run: If True, calculates all changes without modifying the database.
    """
    new_master = db.query(Video).filter(Video.id == new_master_id).first()
    if not new_master:
        raise ValueError(f"New master video #{new_master_id} not found.")

    if old_master_id is not None:
        old_master = db.query(Video).filter(Video.id == old_master_id).first()
    else:
        old_master = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.calibration_status == "master"
        ).first()

    if not old_master:
        raise ValueError(f"Old master video not found for concert #{concert_id}.")

    logger.info(f"Initiating Master Swap: Old #{old_master.id} ({old_master.title[:30]}) -> New #{new_master.id} ({new_master.title[:30]})")

    # 1. Obtain acoustic segment mapping if not provided
    if segments is None:
        from app.crawler.recursive_segment_calibrator import calibrate_video_recursive_segments
        logger.info("Computing acoustic segment partitions between Old and New Master...")
        probe_result = calibrate_video_recursive_segments(old_master.id, db)
        if not probe_result.get("success"):
            raise RuntimeError(f"Acoustic segment probe failed: {probe_result.get('error')}")
        segments = probe_result["segments"]

    transformer = PiecewiseTimelineTransform(segments)

    # 2. Extract or use raw chapter timestamps from Old Master
    if old_master_chapters is None:
        import yt_dlp
        import re
        def parse_sec(t_str):
            parts = list(map(int, t_str.split(':')))
            if len(parts) == 3: return parts[0]*3600 + parts[1]*60 + parts[2]
            return parts[0]*60 + parts[1]

        ydl_opts = {'extract_flat': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={old_master.youtube_id}", download=False)
            desc = info.get('description') or ''

        old_master_chapters = []
        for line in desc.splitlines():
            m = re.match(r'^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$', line.strip())
            if m:
                old_master_chapters.append((float(parse_sec(m.group(1))), m.group(2).strip()))

    # 3. Transform chapters into New Master coordinate frame
    setlist_items = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == concert_id
    ).order_by(ConcertSetlist.display_order.asc()).all()

    setlist_updates = []
    for idx, item in enumerate(setlist_items):
        if idx < len(old_master_chapters):
            orig_old_time, ch_title = old_master_chapters[idx]
        else:
            orig_old_time = float(item.start_time or 0.0)
            ch_title = item.song.name if item.song else (item.event_name or f"Track {item.display_order}")

        new_time = transformer.transform(orig_old_time)
        setlist_updates.append({
            "id": item.id,
            "order": item.display_order,
            "name": ch_title,
            "old_raw_time": orig_old_time,
            "prev_db_time": float(item.start_time or 0.0),
            "new_start_time": new_time,
            "delta": round(new_time - orig_old_time, 2)
        })

    # 4. Prepare Old Master demotion and VideoSyncSegments
    old_master_segments = []
    for s_idx, seg in enumerate(segments):
        v_start = float(seg["video_start_time"])
        v_end = float(seg["video_end_time"])
        offset = float(seg["sync_offset"])
        old_master_segments.append({
            "video_id": old_master.id,
            "video_start_time": v_start,
            "video_end_time": v_end,
            "master_start_time": v_start + offset,
            "master_end_time": v_end + offset,
            "sync_offset": offset,
            "label": f"Cut {s_idx + 1}",
            "is_verified": True
        })

    report = {
        "concert_id": concert_id,
        "old_master": {"id": old_master.id, "title": old_master.title, "duration": old_master.duration},
        "new_master": {"id": new_master.id, "title": new_master.title, "duration": new_master.duration},
        "segment_count": len(segments),
        "setlist_updated_count": len(setlist_updates),
        "setlist_updates": setlist_updates,
        "old_master_segments": old_master_segments,
        "dry_run": dry_run
    }

    if not dry_run:
        logger.info("Applying Master Replacement transaction to database...")

        # 1. Update ConcertSetlist records
        for update_info in setlist_updates:
            s_rec = db.query(ConcertSetlist).filter(ConcertSetlist.id == update_info["id"]).first()
            if s_rec:
                s_rec.start_time = update_info["new_start_time"]

        # 2. Save VideoSyncSegment records for Old Master
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == old_master.id).delete()
        for seg_data in old_master_segments:
            s_obj = VideoSyncSegment(**seg_data)
            db.add(s_obj)

        # 3. Demote Old Master
        old_master.calibration_status = "split_segmented"
        old_master.parent_video_id = new_master.id
        old_master.relative_offset = segments[0]["sync_offset"] if segments else 0.0
        old_master.sync_offset = old_master.relative_offset

        # 4. Promote New Master
        new_master.calibration_status = "master"
        new_master.sync_offset = 0.0
        new_master.parent_video_id = None
        new_master.relative_offset = None

        db.commit()
        logger.info(f"✅ Successfully swapped Master Timeline: New Master is #{new_master.id}!")

    return report
