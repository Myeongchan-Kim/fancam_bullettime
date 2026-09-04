"""
Calibration & Metrics Tracking Layer for Videos.
Provides a unified abstraction for recording video calibrations, tracking counts,
managing statuses, and future engagement/view/like metric increments.
"""
from typing import Optional, List, Dict, Any
import datetime
from sqlalchemy.orm import Session
from app.models.models import Video, VideoSyncSegment

def record_video_calibration(
    db: Session,
    video: Video,
    sync_offset: Optional[float] = None,
    method: str = "manual_studio",
    status: str = "manually_verified",
    commit: bool = True
) -> Video:
    """
    Unified entry point for calibrating video sync offsets.
    - Updates sync_offset
    - Increments calibration_count
    - Updates calibration_status, calibrated_at, and calibration_method
    """
    if sync_offset is not None:
        video.sync_offset = float(sync_offset)
        
    video.calibration_count = (video.calibration_count or 0) + 1
    video.calibration_status = status
    video.calibrated_at = datetime.datetime.now(datetime.UTC)
    video.calibration_method = method
    
    if commit:
        db.commit()
        db.refresh(video)
        
    return video

def increment_video_metrics(
    db: Session,
    video_id: int,
    view: bool = False,
    like: bool = False,
    commit: bool = True
) -> Optional[Video]:
    """Future metric expansion for views/likes counter."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return None
    if view:
        video.view_count = (video.view_count or 0) + 1
    if like:
        video.like_count = (video.like_count or 0) + 1
    if commit:
        db.commit()
    return video
