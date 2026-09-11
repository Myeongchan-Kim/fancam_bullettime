"""
Recursive Segment Calibrator (재귀적 구간 분할 알고리즘)

설명란이나 챕터 정보가 없는 임의 편집 동영상(Fan Edit, Act 모음 등) 및 다중 컷 영상에 대해,
구간의 시작-중간-끝 3개 포인트(Probe)에서 마스터 영상과의 오디오 상호상관(Cross-Correlation)을 측정하고,
오프셋 편차가 기준치(예: 1.5초)를 초과할 경우 재귀적으로 구간을 이등분하여
영상 내부의 모든 컷(Cut) 지점과 곡별 싱크 세그먼트를 자동으로 도출합니다.
"""

import os
import sys
import logging
import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from app.services.calibration import record_video_calibration
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

logger = logging.getLogger(__name__)

PROBE_DURATION = 10.0   # Target video probe duration (seconds)
SEARCH_WINDOW = 60.0    # Master video search window (seconds)
MAX_RECURSION_DEPTH = 3 # Maximum depth for recursive binary splitting (2^3 = 8 partitions per segment)
MIN_SEGMENT_DURATION = 40.0 # Do not split segments shorter than 40 seconds
OFFSET_DRIFT_THRESHOLD = 1.5 # Maximum allowed offset discrepancy within a continuous segment (seconds)


def probe_offset_at(
    yt_target: str,
    yt_master: str,
    t_target: float,
    expected_offset: float,
    prefix: str = "probe",
    probe_duration: float = PROBE_DURATION,
    search_window: float = SEARCH_WINDOW
) -> Dict[str, Any]:
    """
    Measure local sync offset at timestamp `t_target` in target video
    against `yt_master` around expected master time `t_target + expected_offset`.
    """
    est_master = max(0.0, t_target + expected_offset)
    search_start = max(0.0, est_master - (search_window / 2.0))

    tgt_name = f"{prefix}_{yt_target}_{int(t_target)}_{int(probe_duration)}"
    ref_name = f"{prefix}_{yt_master}_{int(search_start)}_{int(search_window)}"

    tgt_wav = download_audio_slice(yt_target, t_target, probe_duration, tgt_name)
    ref_wav = download_audio_slice(yt_master, search_start, search_window, ref_name)

    matched_master_sec, conf = cross_correlate(tgt_wav, ref_wav, search_start)
    
    # If confidence is too low (< 0.08) or negative timestamp, consider match unreliable
    if conf < 0.08 or matched_master_sec < 0:
        return {"success": False, "offset": expected_offset, "confidence": conf}

    measured_offset = matched_master_sec - t_target
    return {
        "success": True,
        "target_time": t_target,
        "master_time": matched_master_sec,
        "offset": round(measured_offset, 2),
        "confidence": round(conf, 3)
    }


def recursive_segment_probe(
    yt_target: str,
    yt_master: str,
    t_start: float,
    t_end: float,
    est_offset: float,
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
    margin = min(10.0, duration * 0.1)
    p_start_t = t_start + margin
    p_end_t = max(p_start_t + 5.0, t_end - margin)
    p_mid_t = (t_start + t_end) / 2.0

    logger.info(f"{'  ' * depth}🔍 [Depth {depth}] Probing [{t_start:.1f}s ~ {t_end:.1f}s] (dur: {duration:.1f}s, prior: {est_offset:+.2f}s)...")

    # If already too short or at max depth, return as a single segment
    if duration < MIN_SEGMENT_DURATION or depth >= max_depth:
        mid_res = probe_offset_at(yt_target, yt_master, p_mid_t, est_offset, f"d{depth}_mid")
        final_offset = mid_res["offset"] if mid_res["success"] else est_offset
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(final_offset, 2),
            "confidence": mid_res.get("confidence", 0.0),
            "depth": depth
        }]

    # Probe 3 points
    res_start = probe_offset_at(yt_target, yt_master, p_start_t, est_offset, f"d{depth}_start")
    res_mid = probe_offset_at(yt_target, yt_master, p_mid_t, est_offset, f"d{depth}_mid")
    res_end = probe_offset_at(yt_target, yt_master, p_end_t, est_offset, f"d{depth}_end")

    offsets = [r["offset"] for r in [res_start, res_mid, res_end] if r["success"]]

    # If not enough successful probes, fallback to available offset
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
        yt_target, yt_master, t_start, p_mid_t, left_est, depth + 1, max_depth
    )
    right_segments = recursive_segment_probe(
        yt_target, yt_master, p_mid_t, t_end, right_est, depth + 1, max_depth
    )

    return left_segments + right_segments


def calibrate_video_recursive_segments(
    video_id: int,
    db: Session,
    target_segment_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Run recursive audio segmentation on a video (or a specific segment of a video).
    - If `target_segment_id` is given: refines only that single segment.
    - If `target_segment_id` is None and video has existing segments: refines each existing segment.
    - If `target_segment_id` is None and video has NO segments: probes whole video [0, duration].
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return {"success": False, "error": f"Video #{video_id} not found"}

    # Robust Master Selection:
    # Must be of the same concert, NOT unavailable/private, NOT self, sorted by duration descending
    master_video = db.query(Video).filter(
        Video.concert_id == video.concert_id,
        Video.id != video.id,
        Video.is_unavailable == False,
        Video.duration > 3600
    ).order_by(Video.duration.desc()).first()

    if not master_video:
        return {"success": False, "error": f"No Master Full Concert found for concert #{video.concert_id}"}

    yt_target = video.youtube_id
    yt_master = master_video.youtube_id
    logger.info(f"🎯 Calibrating Video #{video.id} ({yt_target}) against Master Video #{master_video.id} ({yt_master}, {master_video.duration}s)...")

    setlists = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == video.concert_id
    ).order_by(ConcertSetlist.start_time).all()

    def find_setlist_match(m_start: float, m_end: float) -> tuple[Optional[int], Optional[str]]:
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
            return best.id, name
        return None, None

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
            yt_target, yt_master, t_start, t_end, est_offset
        )

        db.delete(target_seg)
        created_records = []
        for leaf in leaf_segments:
            vs = leaf["video_start_time"]
            ve = leaf["video_end_time"]
            off = leaf["sync_offset"]
            ms = vs + off
            me = ve + off
            s_id, s_name = find_setlist_match(ms, me)
            lbl = s_name or target_seg.label or f"Refined ({int(vs)}s)"
            
            new_s = VideoSyncSegment(
                video_id=video_id,
                setlist_id=s_id,
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
        # Check if video already has segments
        existing_segs = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == video_id
        ).order_by(VideoSyncSegment.video_start_time).all()

        if existing_segs:
            logger.info(f"🚀 Refining {len(existing_segs)} existing segments for Video #{video_id}...")
            all_leafs = []
            for seg in existing_segs:
                leafs = recursive_segment_probe(
                    yt_target, yt_master,
                    seg.video_start_time, seg.video_end_time,
                    seg.sync_offset
                )
                all_leafs.extend(leafs)
            
            db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()
            created_records = []
            for leaf in all_leafs:
                vs = leaf["video_start_time"]
                ve = leaf["video_end_time"]
                off = leaf["sync_offset"]
                ms = vs + off
                me = ve + off
                s_id, s_name = find_setlist_match(ms, me)
                lbl = s_name or f"Segment {int(vs)}s~{int(ve)}s"
                
                new_s = VideoSyncSegment(
                    video_id=video_id,
                    setlist_id=s_id,
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
                sync_offset=created_records[0].sync_offset if created_records else 0.0,
                method="ai_audio_recursive_piecewise",
                status="split_segmented",
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

        else:
            # Calibrate whole unsegmented video
            t_start = 0.0
            t_end = float(video.duration or 300.0)
            est_offset = float(video.sync_offset or 0.0)

            logger.info(f"🚀 Starting Recursive Segmentation on Entire Video #{video_id} [0.0s ~ {t_end}s]...")
            leaf_segments = recursive_segment_probe(
                yt_target, yt_master, t_start, t_end, est_offset
            )

            db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()
            created_records = []
            for leaf in leaf_segments:
                vs = leaf["video_start_time"]
                ve = leaf["video_end_time"]
                off = leaf["sync_offset"]
                ms = vs + off
                me = ve + off
                s_id, s_name = find_setlist_match(ms, me)
                lbl = s_name or f"Segment {int(vs)}s~{int(ve)}s"
                
                new_s = VideoSyncSegment(
                    video_id=video_id,
                    setlist_id=s_id,
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
                status="split_segmented" if len(created_records) > 1 else "ai_calibrated",
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
