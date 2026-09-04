import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, and_, String
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.models import Video, Song, Concert, ConcertSetlist, Contribution, VideoSyncSegment
from app.schemas.schemas import VideoDetail, VideoUpdate, HomeSummary, VideoFullDetail, VideoPagination, VideoSyncSegmentBase, VideoSyncSegmentCreate
from app.services.calibration import record_video_calibration
from ...db import get_db
from .utils import ensure_list, verify_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["videos"])

@router.get("/videos", response_model=VideoPagination)
def get_videos(
    song_id: Optional[int] = None,
    concert_id: Optional[int] = None,
    member: Optional[str] = None,
    angle: Optional[str] = None,
    shorts_only: bool = Query(False),
    include_unavailable: bool = Query(False),
    q: Optional[str] = None,
    start_order: Optional[int] = None,
    end_order: Optional[int] = None,
    offset: int = Query(0),
    limit: int = Query(24),
    db: Session = Depends(get_db)
):
    query = db.query(Video).options(
        selectinload(Video.songs),
        joinedload(Video.concert)
    )

    if not include_unavailable:
        query = query.filter(Video.is_unavailable == False)

    if shorts_only: query = query.filter(Video.is_shorts == True)
    if concert_id: query = query.filter(Video.concert_id == concert_id)
    if song_id: query = query.filter(Video.songs.any(Song.id == song_id))
    if member:
        query = query.filter(Video.members.cast(String).like(f"%{member}%"))
    if angle: query = query.filter(Video.angle == angle)

    # 1. Text Search Filter (q)
    if q and q.strip():
        q_lower = f"%{q.strip().lower()}%"
        query = query.outerjoin(Video.concert).outerjoin(Video.songs)
        query = query.filter(
            or_(
                func.lower(Video.title).like(q_lower),
                func.lower(Video.youtube_id).like(q_lower),
                func.lower(Concert.city).like(q_lower),
                func.lower(Concert.venue).like(q_lower),
                func.lower(Song.name).like(q_lower)
            )
        )

    # 2. Song Order / Setlist Range Filtering
    if start_order is not None and end_order is not None:
        if concert_id:
            max_order_sub = db.query(func.count(ConcertSetlist.id)).filter(ConcertSetlist.concert_id == concert_id).scalar() or 1
            show_untagged = end_order >= max_order_sub
            
            valid_song_ids = db.query(ConcertSetlist.song_id).filter(
                ConcertSetlist.concert_id == concert_id,
                ConcertSetlist.display_order >= (start_order - 1),
                ConcertSetlist.display_order <= (end_order - 1),
                ConcertSetlist.song_id.isnot(None)
            ).all()
            valid_song_ids = [r[0] for r in valid_song_ids]
            
            if show_untagged:
                query = query.filter(
                    or_(
                        Video.songs.any(Song.id.in_(valid_song_ids)),
                        ~Video.songs.any()
                    )
                )
            else:
                query = query.filter(Video.songs.any(Song.id.in_(valid_song_ids)))
        else:
            max_song_order = db.query(func.max(Song.order)).scalar() or 1
            show_untagged = end_order >= max_song_order
            
            if show_untagged:
                query = query.filter(
                    or_(
                        Video.songs.any(and_(Song.order >= start_order, Song.order <= end_order)),
                        ~Video.songs.any()
                    )
                )
            else:
                query = query.filter(Video.songs.any(and_(Song.order >= start_order, Song.order <= end_order)))

    total_count = query.distinct().count()
    
    results = query.distinct().order_by(
        Video.duration.asc(), 
        Video.created_at.desc()
    ).offset(offset).limit(limit).all()
    
    for v in results:
        v.members = ensure_list(v.members)
        
    return {"total_count": total_count, "videos": results}

@router.get("/home/summary", response_model=HomeSummary)
def get_home_summary(response: Response, db: Session = Depends(get_db)):
    """Optimized endpoint for initial page load with Vercel Edge CDN caching."""
    # ⚡ Vercel Edge CDN 캐싱 헤더 설정 (5분 캐시, 백그라운드 갱신 1시간)
    response.headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=3600"
    try:
        songs = db.query(Song).order_by(Song.order).all()
        
        concert_counts = db.query(Video.concert_id, func.count(Video.id)).filter(Video.is_unavailable == False).group_by(Video.concert_id).all()
        counts_dict = {c_id: count for c_id, count in concert_counts if c_id is not None}
        
        concerts = db.query(Concert).options(
            selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
        ).order_by(Concert.date.desc()).all()
        
        for c in concerts:
            c.video_count = counts_dict.get(c.id, 0)

        # 비디오 목록은 홈 화면 렌더링에 필요한 관계만 가볍게 로드
        latest_videos = db.query(Video).options(
            selectinload(Video.songs),
            joinedload(Video.concert)
        ).filter(Video.is_unavailable == False).distinct().order_by(Video.created_at.desc()).limit(24).all()

        mapped_videos = db.query(Video).options(
            selectinload(Video.songs),
            joinedload(Video.concert)
        ).filter(Video.coordinate_x.isnot(None), Video.is_unavailable == False).all()

        video_map = {v.id: v for v in mapped_videos}
        for v in latest_videos:
            if v.id not in video_map:
                video_map[v.id] = v
        
        videos = list(video_map.values())
        videos.sort(key=lambda x: x.created_at, reverse=True)

        for v in videos:
            v.members = ensure_list(v.members)

        return {
            "songs": songs,
            "concerts": concerts,
            "videos": videos,
            "total_videos": db.query(Video).filter(Video.is_unavailable == False).count()
        }
    except Exception as e:
        logger.error(f"❌ Error in get_home_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/videos/{video_id}", response_model=VideoDetail)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).options(
        selectinload(Video.songs),
        joinedload(Video.concert),
        selectinload(Video.sync_segments).joinedload(VideoSyncSegment.setlist).joinedload(ConcertSetlist.song)
    ).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=404, detail="Video not found")
    video.members = ensure_list(video.members)
    return video

@router.post("/videos/{video_id}/mark-unavailable")
def mark_video_unavailable(video_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    """특정 영상을 비공개/삭제(Unavailable)로 마킹하여 UI에서 제외"""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.is_unavailable = True
    db.commit()
    return {"status": "success", "message": f"Video {video_id} marked as unavailable."}

@router.patch("/videos/{video_id}", response_model=VideoDetail)
def update_video(video_id: int, video_update: VideoUpdate, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if not db_video: raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video_update.model_dump(exclude_unset=True)
    if "song_ids" in update_data:
        song_ids = update_data.pop("song_ids")
        db_video.songs = db.query(Song).filter(Song.id.in_(song_ids)).all() if song_ids is not None else []

    if "sync_offset" in update_data:
        new_offset = update_data.pop("sync_offset")
        method = update_data.pop("calibration_method", "manual_studio")
        status = update_data.pop("calibration_status", "manually_verified")
        record_video_calibration(db, db_video, sync_offset=new_offset, method=method, status=status, commit=False)

    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    return db.query(Video).options(
        selectinload(Video.songs),
        joinedload(Video.concert),
        selectinload(Video.sync_segments).joinedload(VideoSyncSegment.setlist).joinedload(ConcertSetlist.song)
    ).filter(Video.id == video_id).first()

@router.get("/videos/{video_id}/full", response_model=VideoFullDetail)
def get_video_full_detail(video_id: int, db: Session = Depends(get_db)):
    """Combined endpoint to fetch everything needed for the detail page in ONE request."""
    video = db.query(Video).options(
        selectinload(Video.songs), 
        joinedload(Video.concert).selectinload(Concert.setlist).joinedload(ConcertSetlist.song),
        selectinload(Video.sync_segments).joinedload(VideoSyncSegment.setlist).joinedload(ConcertSetlist.song)
    ).filter(Video.id == video_id).first()
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    video.members = ensure_list(video.members)

    related_videos = []
    if video.concert_id:
        related_videos = db.query(Video).options(
            selectinload(Video.songs),
            selectinload(Video.sync_segments).joinedload(VideoSyncSegment.setlist).joinedload(ConcertSetlist.song)
        ).filter(
            Video.concert_id == video.concert_id, 
            Video.id != video_id,
            Video.is_unavailable == False
        ).all()
        for v in related_videos:
            v.members = ensure_list(v.members)

    songs = db.query(Song).order_by(Song.order).all()
    concerts = db.query(Concert).options(
        selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
    ).order_by(Concert.date.desc()).all()

    contribs = db.query(Contribution).filter(Contribution.video_id == video_id).order_by(Contribution.created_at.desc()).all()
    
    formatted_contribs = []
    for r in contribs:
        formatted_contribs.append({
            "id": r.id, "video_id": r.video_id, "video_title": video.title,
            "suggested_url": r.suggested_url, "suggested_title": r.suggested_title,
            "suggested_song_ids": ensure_list(r.suggested_song_ids), "suggested_concert_id": r.suggested_concert_id,
            "suggested_members": ensure_list(r.suggested_members), "suggested_duration": r.suggested_duration,
            "suggested_angle": r.suggested_angle, "suggested_coordinate_x": r.suggested_coordinate_x,
            "suggested_coordinate_y": r.suggested_coordinate_y, "suggested_sync_offset": r.suggested_sync_offset,
            "suggested_setlist_id": r.suggested_setlist_id, "suggested_start_time": r.suggested_start_time,
            "suggested_event_name": r.suggested_event_name, "is_processed": r.is_processed, "created_at": r.created_at
        })

    return {
        "video": video,
        "related_videos": related_videos,
        "songs": songs,
        "concerts": concerts,
        "contributions": formatted_contribs
    }

# =========================================================================
# Video Sync Segment Endpoints (Piecewise Timeline Sync)
# =========================================================================

@router.get("/videos/{video_id}/segments", response_model=List[VideoSyncSegmentBase])
def get_video_segments(video_id: int, db: Session = Depends(get_db)):
    """특정 영상의 구간별 타임라인 동기화(Segment) 목록 조회"""
    segments = db.query(VideoSyncSegment).options(
        joinedload(VideoSyncSegment.setlist).joinedload(ConcertSetlist.song)
    ).filter(VideoSyncSegment.video_id == video_id).order_by(VideoSyncSegment.video_start_time.asc()).all()
    return segments

@router.post("/videos/{video_id}/segments", response_model=VideoSyncSegmentBase)
def create_video_segment(
    video_id: int,
    seg_in: VideoSyncSegmentCreate,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    """특정 영상에 새로운 구간 오프셋 생성"""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    offset = seg_in.sync_offset
    if offset is None:
        offset = seg_in.master_start_time - seg_in.video_start_time

    new_seg = VideoSyncSegment(
        video_id=video_id,
        setlist_id=seg_in.setlist_id,
        video_start_time=seg_in.video_start_time,
        video_end_time=seg_in.video_end_time,
        master_start_time=seg_in.master_start_time,
        master_end_time=seg_in.master_end_time,
        sync_offset=offset,
        label=seg_in.label,
        is_verified=seg_in.is_verified or False
    )
    db.add(new_seg)
    db.commit()
    db.refresh(new_seg)
    return new_seg

@router.post("/videos/{video_id}/segments/bulk", response_model=List[VideoSyncSegmentBase])
def set_video_segments_bulk(
    video_id: int,
    segments_in: List[VideoSyncSegmentCreate],
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    """특정 영상의 전체 구간 오프셋 일괄 교체/저장"""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # 기존 세그먼트 삭제 후 일괄 생성
    db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()

    created = []
    for s in segments_in:
        offset = s.sync_offset if s.sync_offset is not None else (s.master_start_time - s.video_start_time)
        new_seg = VideoSyncSegment(
            video_id=video_id,
            setlist_id=s.setlist_id,
            video_start_time=s.video_start_time,
            video_end_time=s.video_end_time,
            master_start_time=s.master_start_time,
            master_end_time=s.master_end_time,
            sync_offset=offset,
            label=s.label,
            is_verified=s.is_verified or False
        )
        db.add(new_seg)
        created.append(new_seg)

    db.commit()
    for s in created:
        db.refresh(s)
    return created

@router.delete("/videos/segments/{segment_id}")
def delete_video_segment(segment_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    """특정 세그먼트 삭제"""
    seg = db.query(VideoSyncSegment).filter(VideoSyncSegment.id == segment_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    db.delete(seg)
    db.commit()
    return {"status": "success", "message": f"Segment {segment_id} deleted"}

@router.post("/videos/{video_id}/auto-align-segments")
def auto_align_video_segments(video_id: int, db: Session = Depends(get_db)):
    """
    양끝 프로브(Boundary Probe) 및 오디오 교차 상관을 이용한 자동 타임라인 세그먼트 정렬
    """
    from app.crawler.timeline_aligner import probe_video_boundaries_and_align
    try:
        res = probe_video_boundaries_and_align(video_id, db)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Failed to align segments"))
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


