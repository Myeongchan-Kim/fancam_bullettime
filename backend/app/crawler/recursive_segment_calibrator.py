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

PROBE_DURATION = 8.0   # Target video probe duration (seconds)
SEARCH_WINDOW = 60.0    # Master video search window (seconds)
MAX_RECURSION_DEPTH = 5 # Maximum depth for recursive binary splitting (2^5 = 32 partitions per segment)
MIN_SEGMENT_DURATION = 15.0 # Minimum segment duration (seconds)
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
    
    # If confidence is too low (< 0.10) or negative timestamp, consider match unreliable
    if conf < 0.10 or matched_master_sec < 0:
        return {"success": False, "offset": expected_offset, "confidence": conf}

    measured_offset = matched_master_sec - t_target
    return {
        "success": True,
        "target_time": t_target,
        "master_time": matched_master_sec,
        "offset": round(measured_offset, 2),
        "confidence": round(conf, 3)
    }


def recover_offset_via_setlist_anchors(
    yt_target: str,
    yt_master: str,
    t_target: float,
    min_master_t: float,
    setlists: List[Dict[str, Any]],
    max_candidates: int = 60
) -> Dict[str, Any]:
    """
    Search downstream in Master using setlist song start times as acoustic anchors
    when standard local search window is lost due to a large jump cut.
    """
    effective_min_m = max(min_master_t, t_target - 60.0)
    tgt_name = f"rec_{yt_target}_{int(t_target)}"
    tgt_wav = download_audio_slice(yt_target, t_target, 8.0, tgt_name)
    candidates = [
        s for s in setlists
        if s.get("start_time") is not None and s["start_time"] >= effective_min_m - 30.0
    ]

    best_match = None
    best_conf = 0.0
    for s in candidates[:max_candidates]:
        m_center = s["start_time"] + 30.0
        ref_name = f"rec_ref_{yt_master}_{int(m_center)}"
        ref_wav = download_audio_slice(yt_master, max(0.0, m_center - 45.0), 90.0, ref_name)
        m_sec, conf = cross_correlate(tgt_wav, ref_wav, max(0.0, m_center - 45.0))
        if conf > best_conf:
            best_conf = conf
            best_match = {
                "success": True,
                "offset": round(m_sec - t_target, 2),
                "confidence": round(conf, 3),
                "master_time": m_sec,
                "song_name": s.get("name")
            }
        if conf >= 0.20:
            return best_match

    if best_conf >= 0.14 and best_match:
        return best_match
    return {"success": False, "offset": None, "confidence": round(best_conf, 3)}


def binary_search_cut_boundary(
    yt_target: str,
    yt_master: str,
    t_left: float,
    t_right: float,
    off_left: float,
    off_right: float,
    steps: int = 5
) -> float:
    """
    Locates the exact transition frame where sync offset switches from off_left to off_right.
    Achieves sub-second boundary precision instead of blind midpoint bisection.
    """
    l = t_left
    r = t_right
    for _ in range(steps):
        mid = (l + r) / 2.0
        tgt_name = f"bsc_{yt_target}_{int(mid*10)}"
        tgt_w = download_audio_slice(yt_target, mid, 4.0, tgt_name)

        ml = max(0.0, mid + off_left)
        refl_name = f"refl_{yt_master}_{int(ml*10)}"
        refl_w = download_audio_slice(yt_master, max(0.0, ml - 10.0), 20.0, refl_name)
        _, conf_l = cross_correlate(tgt_w, refl_w, max(0.0, ml - 10.0))

        mr = max(0.0, mid + off_right)
        refr_name = f"refr_{yt_master}_{int(mr*10)}"
        refr_w = download_audio_slice(yt_master, max(0.0, mr - 10.0), 20.0, refr_name)
        _, conf_r = cross_correlate(tgt_w, refr_w, max(0.0, mr - 10.0))

        if conf_l >= conf_r:
            l = mid
        else:
            r = mid
    return round((l + r) / 2.0, 1)


def merge_adjacent_segments(
    segments: List[Dict[str, Any]],
    max_offset_diff: float = 0.4
) -> List[Dict[str, Any]]:
    """
    Merges adjacent segments if their offsets are virtually identical and contiguous.
    """
    if not segments:
        return []
    merged: List[Dict[str, Any]] = []
    for s in segments:
        if not merged:
            merged.append(dict(s))
        else:
            last = merged[-1]
            if (
                abs(s["sync_offset"] - last["sync_offset"]) <= max_offset_diff
                and abs(s["video_start_time"] - last["video_end_time"]) < 1.0
            ):
                last["video_end_time"] = s["video_end_time"]
                last["sync_offset"] = round((last["sync_offset"] + s["sync_offset"]) / 2.0, 2)
                last["confidence"] = max(last.get("confidence", 0.0), s.get("confidence", 0.0))
            else:
                merged.append(dict(s))
    return merged


def recursive_segment_probe(
    yt_target: str,
    yt_master: str,
    t_start: float,
    t_end: float,
    est_offset: float,
    depth: int = 0,
    max_depth: int = MAX_RECURSION_DEPTH,
    setlists: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Adaptive Multi-Anchor Recursive Segment Calibrator:
    1. Probe start and end points with standard local search.
    2. If sync is lost due to a macro jump cut, automatically query downstream setlist anchors.
    3. If drift > threshold: binary search the exact cut boundary (sub-second precision).
    4. Recursively refine subsegments and merge flat regions.
    """
    duration = t_end - t_start
    margin = min(8.0, duration * 0.1)
    p_start_t = t_start + margin
    p_end_t = max(p_start_t + 4.0, t_end - margin)
    prefix = "  " * depth

    logger.info(f"{prefix}🔍 [Depth {depth}] Testing [{t_start:.1f}s ~ {t_end:.1f}s] (dur: {duration:.1f}s, prior: {est_offset:+.2f}s)...")

    # Base case: too short or reached max depth
    if duration < MIN_SEGMENT_DURATION or depth >= max_depth:
        p_mid_t = (t_start + t_end) / 2.0
        mid_res = probe_offset_at(yt_target, yt_master, p_mid_t, est_offset, f"d{depth}_mid")
        final_offset = mid_res["offset"] if mid_res["success"] else est_offset
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(final_offset, 2),
            "confidence": mid_res.get("confidence", 0.0),
            "depth": depth
        }]

    res_start = probe_offset_at(yt_target, yt_master, p_start_t, est_offset, f"d{depth}_start")
    res_end = probe_offset_at(yt_target, yt_master, p_end_t, est_offset, f"d{depth}_end")

    # Anchor Recovery: If end probe lost sync but start succeeded (jump cut occurred within interval)
    if not res_end["success"] and res_start["success"] and setlists:
        min_m = p_start_t + res_start["offset"]
        recovered = recover_offset_via_setlist_anchors(yt_target, yt_master, p_end_t, min_m, setlists)
        if recovered["success"]:
            res_end = recovered
            logger.info(f"{prefix}  ⚡ [Anchor Recovery @ {p_end_t:.1f}s]: Locked offset {recovered['offset']:+.2f}s (conf={recovered['confidence']}) via {recovered.get('song_name')}")

    # Anchor Recovery: If start probe lost sync but end succeeded
    if not res_start["success"] and res_end["success"] and setlists:
        min_m = max(0.0, t_start + est_offset - 30.0)
        recovered = recover_offset_via_setlist_anchors(yt_target, yt_master, p_start_t, min_m, setlists)
        if recovered["success"]:
            res_start = recovered
            logger.info(f"{prefix}  ⚡ [Anchor Recovery @ {p_start_t:.1f}s]: Locked offset {recovered['offset']:+.2f}s (conf={recovered['confidence']}) via {recovered.get('song_name')}")

    # Both probes succeeded
    if res_start["success"] and res_end["success"]:
        drift = abs(res_end["offset"] - res_start["offset"])
        if drift <= OFFSET_DRIFT_THRESHOLD:
            avg_offset = float(np.mean([res_start["offset"], res_end["offset"]]))
            avg_conf = float(np.mean([res_start["confidence"], res_end["confidence"]]))
            logger.info(f"{prefix}✅ Flat section locked: [{t_start:.1f}s ~ {t_end:.1f}s] -> offset={avg_offset:+.2f}s (conf={avg_conf:.3f})")
            return [{
                "video_start_time": t_start,
                "video_end_time": t_end,
                "sync_offset": round(avg_offset, 2),
                "confidence": round(avg_conf, 3),
                "depth": depth
            }]
        else:
            # Cut detected: use binary search to locate exact boundary
            cut_t = binary_search_cut_boundary(
                yt_target, yt_master, p_start_t, p_end_t, res_start["offset"], res_end["offset"]
            )
            logger.info(f"{prefix}✂️ Cut detected (drift {drift:.2f}s > {OFFSET_DRIFT_THRESHOLD}s)! Localized exact cut at {cut_t:.1f}s (offsets: {res_start['offset']:+.2f}s -> {res_end['offset']:+.2f}s)")
            left_segments = recursive_segment_probe(
                yt_target, yt_master, t_start, cut_t, res_start["offset"], depth + 1, max_depth, setlists
            )
            right_segments = recursive_segment_probe(
                yt_target, yt_master, cut_t, t_end, res_end["offset"], depth + 1, max_depth, setlists
            )
            return left_segments + right_segments

    # Fallback when one or both probes failed
    p_mid_t = (t_start + t_end) / 2.0
    left_est = res_start["offset"] if res_start["success"] else est_offset
    right_est = res_end["offset"] if res_end["success"] else est_offset
    logger.warning(f"{prefix}⚠️ Partial probe signal (s={res_start['success']}, e={res_end['success']}), bisecting at {p_mid_t:.1f}s...")
    left_segments = recursive_segment_probe(
        yt_target, yt_master, t_start, p_mid_t, left_est, depth + 1, max_depth, setlists
    )
    right_segments = recursive_segment_probe(
        yt_target, yt_master, p_mid_t, t_end, right_est, depth + 1, max_depth, setlists
    )
    return left_segments + right_segments


def calibrate_video_recursive_segments(
    video_id: int,
    db: Session,
    target_segment_id: Optional[int] = None,
    force: bool = False
) -> Dict[str, Any]:
    """
    Run recursive audio segmentation on a video (or a specific segment of a video).
    - If `target_segment_id` is given: refines only that single segment.
    - If `target_segment_id` is None and video has existing segments: refines each existing segment (unless verified and not force).
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

    setlists_dict = [
        {"start_time": float(s.start_time), "name": s.song.name if s.song else s.event_name}
        for s in setlists if s.start_time is not None
    ]

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

        # Refine single segment using Pass 2 Bounded Refiner
        from app.crawler.two_pass_calibrator import pass2_refine_bounded_frame
        logger.info(f"🚀 Starting Bounded Refinement on Segment #{target_segment_id} [{t_start}s ~ {t_end}s]...")
        leaf_segments = pass2_refine_bounded_frame(
            yt_target, yt_master, t_start, t_end, est_offset
        )
        leaf_segments = merge_adjacent_segments(leaf_segments)

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
        # Refine whole video
        existing_segs = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == video_id
        ).order_by(VideoSyncSegment.video_start_time).all()

        if existing_segs:
            # Check if any segment is human-verified
            has_verified = any(s.is_verified for s in existing_segs)
            if has_verified and not force:
                logger.warning(
                    f"🛡️ Video #{video_id} has human-verified Ground Truth segments. Skipping overwrite to protect GT."
                )
                return {
                    "success": True,
                    "skipped": True,
                    "message": f"Video #{video_id} contains verified Ground Truth segments. Skipping overwrite to protect GT.",
                    "video_id": video_id,
                    "segments_count": len(existing_segs),
                    "segments": [
                        {
                            "video_start": s.video_start_time,
                            "video_end": s.video_end_time,
                            "sync_offset": s.sync_offset,
                            "label": s.label,
                            "is_verified": s.is_verified
                        }
                        for s in existing_segs
                    ]
                }

            from app.crawler.two_pass_calibrator import pass2_refine_bounded_frame
            logger.info(f"🚀 Refining {len(existing_segs)} existing segments for Video #{video_id} via Pass 2 Bounded Refiner...")
            all_leafs = []
            for seg in existing_segs:
                leafs = pass2_refine_bounded_frame(
                    yt_target, yt_master,
                    seg.video_start_time, seg.video_end_time,
                    seg.sync_offset
                )
                all_leafs.extend(leafs)
            
            all_leafs = merge_adjacent_segments(all_leafs)
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
                method="two_pass_hybrid_bounded",
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
            # Calibrate whole unsegmented video using the Two-Pass Pipeline
            from app.crawler.two_pass_calibrator import run_two_pass_pipeline
            t_end = float(video.duration or 300.0)

            logger.info(f"🚀 Starting Two-Pass Zero-Knowledge Segmentation on Entire Video #{video_id} [0.0s ~ {t_end}s]...")
            leaf_segments = run_two_pass_pipeline(
                yt_target, yt_master, t_end, setlists=setlists_dict
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
