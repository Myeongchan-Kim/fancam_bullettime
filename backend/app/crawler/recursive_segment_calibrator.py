"""
Recursive Segment Calibrator (재귀적 구간 분할 알고리즘)

설명란이나 챕터 정보가 없는 임의 편집 동영상(Fan Edit, Act 모음 등)에 대해,
구간의 시작-중간-끝 3개 포인트(Probe)에서 마스터 영상과의 오디오 상호상관(Cross-Correlation)을 측정하고,
오프셋 편차가 기준치(예: 1.5초)를 초과할 경우 재귀적으로 구간을 이등분하여
영상 내부의 모든 컷(Cut) 지점과 곡별 싱크 세그먼트를 자동으로 도출합니다.
"""

import os
import logging
import numpy as np
import scipy.signal
import scipy.io.wavfile as wavfile
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.crawler.timeline_aligner import get_direct_audio_url, download_audio_slice, correlate_audio_slices
from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from app.services.calibration import record_video_calibration

logger = logging.getLogger(__name__)

PROBE_DURATION = 10.0   # Target video probe duration (seconds)
SEARCH_WINDOW = 60.0    # Master video search window (seconds)
MAX_RECURSION_DEPTH = 3 # Maximum depth for recursive binary splitting (2^3 = 8 partitions per segment)
MIN_SEGMENT_DURATION = 40.0 # Do not split segments shorter than 40 seconds
OFFSET_DRIFT_THRESHOLD = 1.5 # Maximum allowed offset discrepancy within a continuous segment (seconds)


def probe_offset_at(
    url_target: str,
    url_master: str,
    t_target: float,
    expected_offset: float,
    scratch_dir: str,
    prefix: str = "probe"
) -> Dict[str, Any]:
    """
    Measure local sync offset at timestamp `t_target` in target video
    against `url_master` around expected master time `t_target + expected_offset`.
    """
    os.makedirs(scratch_dir, exist_ok=True)
    tgt_wav = os.path.join(scratch_dir, f"{prefix}_tgt_{int(t_target)}.wav")
    ref_wav = os.path.join(scratch_dir, f"{prefix}_m_{int(t_target)}.wav")

    # Target slice: 10s
    ok_tgt = download_audio_slice(url_target, t_target, PROBE_DURATION, tgt_wav)
    if not ok_tgt:
        return {"success": False, "offset": expected_offset, "confidence": 0.0}

    # Master slice: search window [est_master - SEARCH_WINDOW/2, est_master + SEARCH_WINDOW/2]
    est_master = max(0.0, t_target + expected_offset)
    search_start = max(0.0, est_master - (SEARCH_WINDOW / 2.0))
    ok_ref = download_audio_slice(url_master, search_start, SEARCH_WINDOW, ref_wav)
    if not ok_ref:
        return {"success": False, "offset": expected_offset, "confidence": 0.0}

    matched_master_sec, conf = correlate_audio_slices(tgt_wav, ref_wav, search_start)
    
    # If confidence is too low (< 0.10), consider match unreliable
    if conf < 0.10:
        return {"success": False, "offset": expected_offset, "confidence": conf}

    measured_offset = matched_master_sec - t_target
    return {
        "success": True,
        "target_time": t_target,
        "master_time": matched_master_sec,
        "offset": measured_offset,
        "confidence": conf
    }


def recursive_segment_probe(
    url_target: str,
    url_master: str,
    t_start: float,
    t_end: float,
    est_offset: float,
    scratch_dir: str,
    depth: int = 0,
    max_depth: int = MAX_RECURSION_DEPTH
) -> List[Dict[str, Any]]:
    """
    Recursively probe and partition [t_start, t_end] using 3-Point verification:
    1. Probe start (t_start + margin), mid ((t_start + t_end)/2), end (t_end - margin).
    2. If max(diff(offsets)) <= OFFSET_DRIFT_THRESHOLD: Base case -> Single continuous segment.
    3. If drift > threshold and depth < max_depth and duration > MIN_SEGMENT_DURATION:
       Split into [t_start, t_mid] and [t_mid, t_end] recursively.
    """
    duration = t_end - t_start
    margin = min(5.0, duration * 0.1)
    p_start_t = t_start + margin
    p_end_t = max(p_start_t + 5.0, t_end - margin)
    p_mid_t = (t_start + t_end) / 2.0

    logger.info(f"{'  ' * depth}🔍 [Depth {depth}] Probing [{t_start:.1f}s ~ {t_end:.1f}s] (dur: {duration:.1f}s)...")

    # If already too short or at max depth, return as a single segment
    if duration < MIN_SEGMENT_DURATION or depth >= max_depth:
        # Measure at midpoint
        mid_res = probe_offset_at(url_target, url_master, p_mid_t, est_offset, scratch_dir, f"d{depth}_mid")
        final_offset = mid_res["offset"] if mid_res["success"] else est_offset
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(final_offset, 2),
            "confidence": mid_res.get("confidence", 0.0),
            "depth": depth
        }]

    # Probe 3 points
    res_start = probe_offset_at(url_target, url_master, p_start_t, est_offset, scratch_dir, f"d{depth}_start")
    res_mid = probe_offset_at(url_target, url_master, p_mid_t, est_offset, scratch_dir, f"d{depth}_mid")
    res_end = probe_offset_at(url_target, url_master, p_end_t, est_offset, scratch_dir, f"d{depth}_end")

    offsets = [r["offset"] for r in [res_start, res_mid, res_end] if r["success"]]

    # If not enough successful probes, fallback to available offset or recurse
    if len(offsets) < 2:
        logger.warning(f"{'  ' * depth}⚠️ Low probe signals in [{t_start:.1f}s ~ {t_end:.1f}s], fallback offset={est_offset:.2f}s")
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(est_offset, 2),
            "confidence": 0.0,
            "depth": depth
        }]

    max_drift = max(offsets) - min(offsets)
    logger.info(f"{'  ' * depth}📊 Drift in [{t_start:.1f}s ~ {t_end:.1f}s] = {max_drift:.2f}s (offsets: {[round(o, 2) for o in offsets]})")

    # Base case: Consistent offset across whole segment
    if max_drift <= OFFSET_DRIFT_THRESHOLD:
        avg_offset = float(np.mean(offsets))
        avg_conf = float(np.mean([r["confidence"] for r in [res_start, res_mid, res_end] if r["success"]]))
        logger.info(f"{'  ' * depth}✅ Segment locked: [{t_start:.1f}s ~ {t_end:.1f}s] -> offset={avg_offset:.2f}s (conf={avg_conf:.3f})")
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(avg_offset, 2),
            "confidence": round(avg_conf, 3),
            "depth": depth
        }]

    # Recursive step: Cut detected within interval, divide and conquer
    logger.info(f"{'  ' * depth}✂️ Cut detected (drift {max_drift:.2f}s > {OFFSET_DRIFT_THRESHOLD}s)! Splitting at {p_mid_t:.1f}s...")
    
    left_est = res_start["offset"] if res_start["success"] else est_offset
    right_est = res_end["offset"] if res_end["success"] else est_offset

    left_segments = recursive_segment_probe(
        url_target, url_master, t_start, p_mid_t, left_est, scratch_dir, depth + 1, max_depth
    )
    right_segments = recursive_segment_probe(
        url_target, url_master, p_mid_t, t_end, right_est, scratch_dir, depth + 1, max_depth
    )

    return left_segments + right_segments


def calibrate_video_recursive_segments(video_id: int, db: Session, target_segment_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Run recursive audio segmentation on a video (or a specific segment of a video).
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return {"success": False, "error": f"Video #{video_id} not found"}

    master_video = db.query(Video).filter(
        Video.concert_id == video.concert_id,
        Video.duration > 3600
    ).first()
    if not master_video:
        return {"success": False, "error": f"No Master Full Concert found for concert #{video.concert_id}"}

    url_target = get_direct_audio_url(video.youtube_id)
    url_master = get_direct_audio_url(master_video.youtube_id)
    if not url_target or not url_master:
        return {"success": False, "error": "Failed to extract streaming audio URLs"}

    scratch_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "scratch", "recursive_sync", str(video_id)
    )

    setlists = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == video.concert_id
    ).order_by(ConcertSetlist.start_time).all()

    def label_for_range(m_start: float, m_end: float) -> Optional[str]:
        # Find closest setlist item matching master start time
        best = None
        min_dist = float("inf")
        for s in setlists:
            if s.start_time is not None:
                dist = abs(s.start_time - m_start)
                if dist < min_dist:
                    min_dist = dist
                    best = s
        if best and min_dist <= 180.0:
            name = best.song.name if best.song else best.event_name
            return name
        return None

    if target_segment_id:
        target_seg = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.id == target_segment_id,
            VideoSyncSegment.video_id == video_id
        ).first()
        if not target_seg:
            return {"success": False, "error": f"Segment #{target_segment_id} not found"}

        t_start = target_seg.video_start_time
        t_end = target_seg.video_end_time
        est_offset = target_seg.sync_offset

        logger.info(f"🚀 Starting Recursive Segmentation on Segment #{target_segment_id} [{t_start}s ~ {t_end}s]...")
        leaf_segments = recursive_segment_probe(
            url_target, url_master, t_start, t_end, est_offset, scratch_dir
        )

        # Replace target segment with refined leaf segments
        db.delete(target_seg)
        created_records = []
        for leaf in leaf_segments:
            vs = leaf["video_start_time"]
            ve = leaf["video_end_time"]
            off = leaf["sync_offset"]
            ms = vs + off
            me = ve + off
            lbl = label_for_range(ms, me) or target_seg.label or f"Refined ({int(vs)}s)"
            
            new_s = VideoSyncSegment(
                video_id=video_id,
                video_start_time=vs,
                video_end_time=ve,
                master_start_time=ms,
                master_end_time=me,
                sync_offset=off,
                label=lbl,
                is_verified=True
            )
            db.add(new_s)
            created_records.append(new_s)

        db.commit()
        return {
            "success": True,
            "video_id": video_id,
            "refined_segment_id": target_segment_id,
            "new_segments_count": len(created_records),
            "segments": [
                {
                    "video_start": s.video_start_time,
                    "video_end": s.video_end_time,
                    "sync_offset": s.sync_offset,
                    "label": s.label
                }
                for s in created_records
            ]
        }
    else:
        # Calibrate whole video
        t_start = 0.0
        t_end = float(video.duration or 300.0)
        est_offset = float(video.sync_offset or 0.0)

        logger.info(f"🚀 Starting Recursive Segmentation on Entire Video #{video_id} [0.0s ~ {t_end}s]...")
        leaf_segments = recursive_segment_probe(
            url_target, url_master, t_start, t_end, est_offset, scratch_dir
        )

        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()
        created_records = []
        for leaf in leaf_segments:
            vs = leaf["video_start_time"]
            ve = leaf["video_end_time"]
            off = leaf["sync_offset"]
            ms = vs + off
            me = ve + off
            lbl = label_for_range(ms, me) or f"Segment {int(vs)}s~{int(ve)}s"
            
            new_s = VideoSyncSegment(
                video_id=video_id,
                video_start_time=vs,
                video_end_time=ve,
                master_start_time=ms,
                master_end_time=me,
                sync_offset=off,
                label=lbl,
                is_verified=True
            )
            db.add(new_s)
            created_records.append(new_s)

        record_video_calibration(
            db,
            video,
            sync_offset=created_records[0].sync_offset if created_records else est_offset,
            method="ai_audio_recursive_piecewise",
            status="ai_calibrated",
            commit=False
        )

        db.commit()
        return {
            "success": True,
            "video_id": video_id,
            "new_segments_count": len(created_records),
            "segments": [
                {
                    "video_start": s.video_start_time,
                    "video_end": s.video_end_time,
                    "sync_offset": s.sync_offset,
                    "label": s.label
                }
                for s in created_records
            ]
        }
