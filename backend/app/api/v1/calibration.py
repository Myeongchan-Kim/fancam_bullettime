import os
import shutil
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.models import Video
from app.services.calibration import estimate_video_rough_offset, record_video_calibration
from app.services.sync.master_election import elect_master_video, get_candidate_master_videos
from app.services.sync.precision_calibrator import calibrate_video_2stage_visual_and_audio
from ...db import get_db
from .utils import verify_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["calibration"])


def _ensure_local_dsp_tools():
    if not shutil.which("ffmpeg") or not (shutil.which("yt-dlp") or os.path.exists("/opt/homebrew/bin/yt-dlp")):
        raise HTTPException(
            status_code=400,
            detail="서버리스(Vercel) 환경에서는 대용량 오디오 DSP 연산(FFmpeg/yt-dlp)이 지원되지 않습니다. CLI 스크립트를 통해 로컬 환경에서 실행해주세요."
        )


@router.post("/videos/{video_id}/auto-align-segments")
def auto_align_video_segments(
    video_id: int,
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin),
):
    """
    양끝 프로브(Boundary Probe) 및 오디오 교차 상관을 이용한 자동 타임라인 세그먼트 정렬
    """
    _ensure_local_dsp_tools()

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
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin),
):
    """
    오디오 3-Point 교차 상관 및 재귀 분할(Recursive Piecewise Segmentation) 알고리즘
    설명란이나 챕터가 없는 편집 영상도 오디오 파형 상관분석으로 내부 편집점(Cut)을 스스로 찾아내어 분할
    """
    _ensure_local_dsp_tools()

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
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    candidate_masters = get_candidate_master_videos(
        db,
        concert_id=video.concert_id,
        min_master_duration=3600.0,
        exclude_video_id=video.id,
    )

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
            raise HTTPException(
                status_code=400,
                detail=f"AI Precision Sync failed to lock offset with sufficient confidence (Last attempt: {last_error or 'low correlation'})"
            )

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
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    candidates = []

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

    if include_visual:
        try:
            from app.crawler.visual_group_aligner import find_visual_group_location

            master_video = elect_master_video(db, video.concert_id, exclude_video_id=video.id)
            if master_video and video.youtube_id:
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
                    search_window = (
                        max(0.0, approx_offset - 900.0),
                        min(float(master_video.duration), approx_offset + 900.0)
                    )

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
