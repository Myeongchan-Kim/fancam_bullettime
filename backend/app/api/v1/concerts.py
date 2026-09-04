from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload, joinedload

from ...models.models import Video, Concert, ConcertSetlist
from ...schemas.schemas import ConcertBase
from ...db import get_db
from .utils import verify_admin

router = APIRouter(prefix="/api", tags=["concerts"])

@router.get("/concerts", response_model=List[ConcertBase])
def get_concerts(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=86400"
    concert_counts = db.query(Video.concert_id, func.count(Video.id)).group_by(Video.concert_id).all()
    counts_dict = {c_id: count for c_id, count in concert_counts if c_id is not None}
    
    concerts = db.query(Concert).options(selectinload(Concert.setlist).joinedload(ConcertSetlist.song)).order_by(Concert.date.desc()).all()
    for c in concerts:
        c.video_count = counts_dict.get(c.id, 0)
    return concerts

@router.get("/concerts/{concert_id}", response_model=ConcertBase)
def get_concert(concert_id: int, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=86400"
    concert = db.query(Concert).options(
        selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
    ).filter(Concert.id == concert_id).first()
    if not concert:
        raise HTTPException(status_code=404, detail="Concert not found")
    
    count = db.query(func.count(Video.id)).filter(Video.concert_id == concert_id).scalar() or 0
    concert.video_count = count
    return concert


@router.patch("/admin/setlist/{item_id}")
def update_setlist_item(item_id: int, start_time: float = Query(...), db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    item = db.query(ConcertSetlist).filter(ConcertSetlist.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Setlist item not found")
    item.start_time = start_time
    db.commit()
    return {"message": "Updated setlist timing", "new_time": start_time}

@router.post("/admin/concerts/{concert_id}/setlist")
def import_setlist(concert_id: int, items: List[dict], db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    if not db.query(Concert).filter(Concert.id == concert_id).first(): raise HTTPException(status_code=404, detail="Concert not found")
    db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).delete()
    for idx, item in enumerate(items):
        db.add(ConcertSetlist(concert_id=concert_id, song_id=item.get("song_id"), event_name=item.get("event_name"), start_time=item.get("start_time"), display_order=idx))
    db.commit()
    return {"message": f"Successfully imported {len(items)} setlist items"}

@router.get("/concerts/{concert_id}/sync-graph")
def get_concert_sync_graph(concert_id: int, db: Session = Depends(get_db)):
    concert = db.query(Concert).options(
        selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
    ).filter(Concert.id == concert_id).first()
    if not concert:
        raise HTTPException(status_code=404, detail="Concert not found")
        
    videos = db.query(Video).options(
        selectinload(Video.sync_segments),
        selectinload(Video.songs)
    ).filter(
        Video.concert_id == concert_id,
        Video.is_unavailable == False
    ).order_by(Video.sync_offset.asc()).all()
    
    # The Master Video is the video with the longest total concert duration (>= 7200s, e.g. Video 1094 with 10998s)
    long_videos = [v for v in videos if v.duration and v.duration > 3600]
    if long_videos:
        master_video = max(long_videos, key=lambda v: v.duration)
    else:
        master_video = videos[0] if videos else None
        
    setlist_items = []
    sorted_setlist = sorted(concert.setlist, key=lambda x: x.display_order if x.display_order is not None else 999)
    for idx, item in enumerate(sorted_setlist):
        s_name = item.song.name if item.song else (item.event_name or "Event")
        start_t = item.start_time or 0.0
        next_t = sorted_setlist[idx + 1].start_time if (idx + 1 < len(sorted_setlist) and sorted_setlist[idx + 1].start_time is not None and sorted_setlist[idx + 1].start_time > start_t) else start_t + 200.0
        setlist_items.append({
            "id": item.id,
            "song_id": item.song_id,
            "name": s_name,
            "is_solo": item.song.is_solo if item.song else False,
            "member_name": item.song.member_name if item.song else None,
            "act": item.song.act if item.song else None,
            "display_order": item.display_order,
            "start_time": start_t,
            "end_time": next_t
        })
        
    video_nodes = []
    for v in videos:
        is_master = (master_video and v.id == master_video.id)
        dur = v.duration or 0.0
        offset = v.sync_offset or 0.0
        
        segs = []
        # For master video, treat as a single continuous 0 ~ duration spine without split segments
        if is_master:
            segs = []
            master_start = 0.0
            master_end = dur
        elif v.sync_segments:
            # If segments are just 15s calibration probes on a short fancam (<600s), ignore them and treat as continuous video
            raw_segs = v.sync_segments
            if dur < 600 and all((seg.video_end_time - seg.video_start_time) <= 30 for seg in raw_segs):
                segs = []
            else:
                for seg in raw_segs:
                    segs.append({
                        "id": seg.id,
                        "video_start": seg.video_start_time,
                        "video_end": seg.video_end_time,
                        "master_start": seg.master_start_time,
                        "master_end": seg.master_end_time,
                        "sync_offset": seg.sync_offset,
                        "label": seg.label,
                        "is_verified": seg.is_verified
                    })
                
        if not is_master:
            if segs:
                master_start = min(s["master_start"] for s in segs)
                master_end = max(s["master_end"] for s in segs)
            else:
                master_start = offset
                master_end = offset + dur
            
        calib_count = v.calibration_count or 0
        calib_status = v.calibration_status or ("uncalibrated" if calib_count == 0 and not is_master else "verified")
        
        status = "verified"
        status_reason = "Verified audio/visual sync"
        if is_master:
            status = "master"
            status_reason = "Master Timeline Reference"
        elif segs:
            status = "segmented"
            status_reason = f"Split into {len(segs)} segments"
        elif calib_count == 0 or calib_status == "uncalibrated":
            status = "uncalibrated"
            status_reason = "미보정 영상 (Calibration Count: 0)"
        elif calib_status == "ai_calibrated":
            status = "ai_calibrated"
            status_reason = f"AI 자동 보정 ({v.calibration_method or 'AI'})"
        else:
            if v.songs:
                matching_setlists = [s for s in setlist_items if s["song_id"] in [sg.id for sg in v.songs]]
                if matching_setlists:
                    expected_start = matching_setlists[0]["start_time"]
                    diff = abs(offset - expected_start)
                    if diff > 180.0 and not v.sync_segments:
                        status = "drift_warning"
                        status_reason = f"Potential Drift ({diff:.0f}s gap from setlist song)"
                        
        video_nodes.append({
            "id": v.id,
            "youtube_id": v.youtube_id,
            "title": v.title,
            "duration": dur,
            "sync_offset": offset,
            "master_start_time": master_start,
            "master_end_time": master_end,
            "members": v.members or [],
            "angle": v.angle,
            "is_master": is_master,
            "status": status,
            "status_reason": status_reason,
            "calibration_count": calib_count,
            "calibration_status": calib_status,
            "calibrated_at": v.calibrated_at.isoformat() if v.calibrated_at else None,
            "calibration_method": v.calibration_method,
            "view_count": v.view_count or 0,
            "like_count": v.like_count or 0,
            "segments": segs,
            "songs": [{"id": s.id, "name": s.name, "is_solo": s.is_solo, "member_name": s.member_name} for s in v.songs] if v.songs else []
        })
        
    return {
        "concert": {
            "id": concert.id,
            "date": concert.date.isoformat() if concert.date else None,
            "city": concert.city,
            "venue": concert.venue,
            "total_videos": len(videos)
        },
        "master_video": {
            "id": master_video.id if master_video else None,
            "youtube_id": master_video.youtube_id if master_video else None,
            "duration": master_video.duration if master_video else 10800.0,
            "title": master_video.title if master_video else None
        } if master_video else None,
        "setlist": setlist_items,
        "videos": video_nodes
    }

