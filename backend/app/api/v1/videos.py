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
        p_id = update_data.pop("parent_video_id", None)
        r_offset = update_data.pop("relative_offset", None)
        record_video_calibration(
            db, 
            db_video, 
            sync_offset=new_offset, 
            method=method, 
            status=status,
            parent_video_id=p_id,
            relative_offset=r_offset,
            commit=False
        )

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
        members=seg_in.members,
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
            members=s.members,
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

@router.post("/videos/{video_id}/recursive-segment-align")
def trigger_recursive_segment_alignment(
    video_id: int,
    segment_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    오디오 3-Point 교차 상관 및 재귀 분할(Recursive Piecewise Segmentation) 알고리즘
    설명란이나 챕터가 없는 편집 영상도 오디오 파형 상관분석으로 내부 편집점(Cut)을 스스로 찾아내어 분할
    """
    from app.crawler.recursive_segment_calibrator import calibrate_video_recursive_segments
    try:
        res = calibrate_video_recursive_segments(video_id, db, target_segment_id=segment_id)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Recursive segmentation failed"))
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos/{video_id}/ai-sync")
def trigger_video_ai_sync(
    video_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    """
    2-Stage Multi-Modal Precision Sync (Gemini Vision 1st Stage + 3-Point Audio 2nd Stage)
    """
    from scripts.precision_sync_calibrator import calibrate_video_2stage_visual_and_audio
    
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    candidate_masters = db.query(Video).filter(
        Video.concert_id == video.concert_id,
        Video.duration > 3600
    ).all()
    # Sort candidate masters: prefer 0.0 offset or active reference videos like #63, #1094
    candidate_masters.sort(key=lambda m: (0 if m.id == 63 else 1 if m.sync_offset == 0.0 else 2, -m.duration))
    
    if not candidate_masters:
        raise HTTPException(status_code=400, detail="Master full concert video not found for this concert")
        
    prev_offset = video.sync_offset or 0.0
    try:
        success = False
        last_error = None
        for master_video in candidate_masters:
            logger.info(f"Trying Master Video #{master_video.id} ({master_video.title}) for Video #{video.id}...")
            try:
                success = calibrate_video_2stage_visual_and_audio(db, video, master_video)
                if success:
                    break
            except Exception as e:
                logger.warning(f"Failed AI sync with Master #{master_video.id}: {e}")
                last_error = str(e)
                
        if not success:
            raise HTTPException(status_code=400, detail=f"AI Precision Sync failed to lock offset with sufficient confidence (Last attempt: {last_error or 'low correlation'})")
            
        db.refresh(video)
        return {
            "status": "success",
            "video_id": video.id,
            "previous_offset": prev_offset,
            "new_offset": video.sync_offset,
            "delta": round(video.sync_offset - prev_offset, 2),
            "calibration_count": video.calibration_count,
            "calibration_status": video.calibration_status,
            "calibration_method": video.calibration_method,
            "calibrated_at": video.calibrated_at.isoformat() if video.calibrated_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"AI sync failed for video {video_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI Sync 실행 중 오류: {str(e)} (Vercel Serverless 환경에서는 로컬 백엔드 또는 워커 컨테이너가 필요할 수 있습니다.)"
        )

@router.post("/videos/{video_id}/rough-sync")
def trigger_video_rough_sync(
    video_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    """
    영상 설명란 타임스탬프, 곡 메타데이터, 콘서트 세트리스트 기반 대략적 위치(Macro Offset) 즉시 안착
    """
    from app.services.calibration import estimate_video_rough_offset, record_video_calibration
    
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    approx_offset, reason, parent_id = estimate_video_rough_offset(db, video)
    if approx_offset is None:
        raise HTTPException(status_code=400, detail="영상 설명란 및 세트리스트에서 일치하는 곡 위치를 찾지 못했습니다.")
        
    prev_offset = video.sync_offset or 0.0
    rel_offset = None
    if parent_id:
        parent = db.query(Video).filter(Video.id == parent_id).first()
        if parent and parent.sync_offset is not None:
            rel_offset = round(approx_offset - parent.sync_offset, 2)
            
    record_video_calibration(
        db,
        video,
        sync_offset=round(approx_offset, 2),
        method="ai_setlist_macro_sync",
        status="ai_calibrated",
        parent_video_id=parent_id,
        relative_offset=rel_offset,
        commit=True
    )
    
    return {
        "status": "success",
        "video_id": video.id,
        "previous_offset": prev_offset,
        "new_offset": video.sync_offset,
        "delta": round(video.sync_offset - prev_offset, 2),
        "reason": reason,
        "parent_video_id": video.parent_video_id,
        "relative_offset": video.relative_offset,
        "calibration_status": video.calibration_status,
        "calibration_method": video.calibration_method
    }

@router.post("/videos/{video_id}/rough-sync-candidates")
def get_video_rough_sync_candidates(
    video_id: int,
    include_visual: bool = False,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    """
    영상 위치 추정을 위해 두 가지 알고리즘(세트리스트/설명란 기반 vs 비디오 프레임 비주얼 매칭)을
    계산하여 후보 리스트를 반환합니다. DB를 바로 변경하지 않고 사용자 선택을 지원합니다.
    - include_visual=False (기본값): 수 밀리초만에 세트리스트/메타데이터 후보 반환 (서버리스 타임아웃 방지)
    - include_visual=True: 요청 시 비디오 프레임 비주얼 그룹 매칭까지 시도
    """
    from app.services.calibration import estimate_video_rough_offset

    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    candidates = []

    # 1. Option A: 텍스트 / 세트리스트 기반 대략적 위치 (빠르고 안정적)
    approx_offset, reason, parent_id = estimate_video_rough_offset(db, video)
    if approx_offset is not None:
        candidates.append({
            "id": "setlist_metadata",
            "name": "세트리스트 & 메타데이터 기반",
            "estimated_offset": round(approx_offset, 2),
            "reason": reason or "등록된 곡 세트리스트 기반 추정",
            "confidence": 0.7,
            "badge": "📜 세트리스트",
            "parent_video_id": parent_id
        })

    # 2. Option B: 비디오 프레임 비주얼 그룹 매칭 (Visual Frame Matching)
    # include_visual 플래그가 True일 때만 실행하여 서버리스 함수 타임아웃 방지
    if include_visual:
        try:
            from app.crawler.visual_group_aligner import find_visual_group_location

            long_videos = db.query(Video).filter(
                Video.concert_id == video.concert_id,
                Video.is_unavailable == False,
                Video.duration > 3600
            ).all()

            if long_videos and video.youtube_id:
                master_video = max(long_videos, key=lambda v: v.duration)
                peer_yids = [video.youtube_id]
                if video.songs:
                    primary_song = video.songs[0]
                    peers = db.query(Video).filter(
                        Video.concert_id == video.concert_id,
                        Video.is_unavailable == False,
                        Video.id != video.id,
                        Video.songs.any(id=primary_song.id)
                    ).limit(4).all()
                    peer_yids.extend([p.youtube_id for p in peers if p.youtube_id])

                search_window = None
                if approx_offset is not None:
                    search_window = (max(0.0, approx_offset - 900.0), min(float(master_video.duration), approx_offset + 900.0))

                v_res = find_visual_group_location(
                    master_youtube_id=master_video.youtube_id,
                    fancam_youtube_ids=peer_yids,
                    search_window=search_window,
                    master_interval_sec=30.0,
                    fancam_sample_offset_sec=30.0,
                    use_gemini_verification=True
                )
                if v_res.get("success"):
                    candidates.append({
                        "id": "visual_matching",
                        "name": "비주얼 화면 그룹 매칭 (Gemini/Vision)",
                        "estimated_offset": round(v_res["best_master_time"] - 30.0, 2),
                        "reason": v_res.get("reason") or "마스터 영상 무대 조명 및 의상 화면 일치",
                        "confidence": round(v_res.get("confidence", 0.85), 3),
                        "badge": "👁️ 비주얼 매칭",
                        "parent_video_id": master_video.id
                    })
        except Exception as e:
            logger.warning(f"Visual group aligner failed or not available in current environment: {e}")

    return {
        "video_id": video.id,
        "current_offset": video.sync_offset,
        "candidates": candidates
    }





