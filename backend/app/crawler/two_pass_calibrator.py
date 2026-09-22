"""
Two-Pass Zero-Knowledge Segment Calibrator (TwoPassSegmentCalibrator)

A hybrid macro/micro architecture for unsegmented concert fancams and multi-cut videos:
1. Pass 1 (Global Landmark Anchor Grid):
   - Macro skeleton discovery without requiring pre-existing database segments.
   - Forward continuity probe (coarse step 90s) + downstream setlist acoustic anchor recovery.
   - Generates coarse bounded frames [t_start, t_end, base_offset].
2. Pass 2 (Bounded Frame Local Refiner):
   - Operates strictly inside each bounded frame [t_start, t_end] (immune to global drift/hallucinations).
   - Constrained local search window (base_offset +/- 30s).
   - 5-step bisection cut localization for sub-second precision.
   - Merges adjacent continuous intervals (|delta_offset| <= 0.4s).

Supports two execution modes:
- Mode A (Pure Zero-Knowledge): Pass 1 (Auto Macro Skeleton) -> Pass 2 (Bounded Refinement).
- Mode B (Human / Pre-set Bounded): Takes existing rough frames (from human annotations or pre-existing DB cuts)
  and runs Pass 2 strictly within those user-defined boundaries.
"""

import logging
import os
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from app.services.calibration import record_video_calibration
from app.services.audio_dsp import download_audio_slice, cross_correlate
from app.crawler.recursive_segment_calibrator import (
    binary_search_cut_boundary,
    merge_adjacent_segments
)

logger = logging.getLogger(__name__)

# Constants
DEFAULT_COARSE_STEP = 90.0       # Pass 1 stride (seconds)
DEFAULT_SEARCH_WINDOW = 60.0     # Pass 2 local search window (seconds, +/- 30s)
DEFAULT_PROBE_DUR = 8.0          # Acoustic probe duration (seconds)
MIN_SEGMENT_DUR = 15.0           # Minimum segment duration (seconds)
MAX_RECURSION_DEPTH = 4          # Max bisection depth per bounded frame (2^4 = 16 sub-partitions)
CONFIDENCE_THRESHOLD = 0.14      # Acoustic match confidence cutoff
DRIFT_THRESHOLD = 1.0            # Offset drift to trigger bisection cut search (seconds)


def probe_local(
    yt_tgt: str,
    yt_ref: str,
    t_tgt: float,
    base_off: float,
    search_win: float = DEFAULT_SEARCH_WINDOW,
    dur: float = DEFAULT_PROBE_DUR,
    prefix: str = "tp_probe"
) -> Dict[str, Any]:
    """
    Measures acoustic cross-correlation in a localized window centered around base_off.
    """
    est_m = max(0.0, t_tgt + base_off)
    ref_start = max(0.0, est_m - search_win / 2.0)
    tgt_name = f"{prefix}_tgt_{yt_tgt}_{int(t_tgt)}_{int(dur)}"
    ref_name = f"{prefix}_ref_{yt_ref}_{int(ref_start)}_{int(search_win)}"

    tgt_w = download_audio_slice(yt_tgt, t_tgt, dur, tgt_name)
    ref_w = download_audio_slice(yt_ref, ref_start, search_win, ref_name)

    m_sec, conf = cross_correlate(tgt_w, ref_w, ref_start)
    matched_offset = m_sec - t_tgt
    is_success = conf >= CONFIDENCE_THRESHOLD and m_sec >= 0

    return {
        "success": is_success,
        "offset": round(matched_offset, 2) if is_success else base_off,
        "conf": round(conf, 3),
        "master_time": round(m_sec, 2)
    }


def find_setlist_landmark(
    yt_tgt: str,
    yt_ref: str,
    t_tgt: float,
    min_m: float,
    setlists: List[Dict[str, Any]],
    max_window: float = 3600.0,
    prefix: str = "tp_sl"
) -> Dict[str, Any]:
    """
    Scans downstream setlist song start positions to recover synchronization
    when a large jump cut or scene change causes standard tracking to lose signal.
    """
    tgt_name = f"{prefix}_tgt_{yt_tgt}_{int(t_tgt)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, 8.0, tgt_name)
    candidates = [
        s for s in setlists
        if s.get("start_time") is not None and (min_m - 30.0 <= s["start_time"] <= min_m + max_window)
    ]

    best = None
    for s in candidates:
        m_center = s["start_time"] + 30.0
        ref_name = f"{prefix}_ref_{yt_ref}_{int(m_center)}"
        ref_w = download_audio_slice(yt_ref, max(0.0, m_center - 45.0), 90.0, ref_name)
        m_sec, conf = cross_correlate(tgt_w, ref_w, max(0.0, m_center - 45.0))
        if conf >= 0.20:
            return {
                "success": True,
                "offset": round(m_sec - t_tgt, 2),
                "conf": round(conf, 3),
                "name": s.get("name", "Setlist Anchor")
            }
        if conf >= CONFIDENCE_THRESHOLD and (best is None or conf > best["conf"]):
            best = {
                "success": True,
                "offset": round(m_sec - t_tgt, 2),
                "conf": round(conf, 3),
                "name": s.get("name", "Setlist Anchor")
            }

    if best:
        return best
    return {"success": False, "offset": None, "conf": 0.0}


def pass1_generate_coarse_frames(
    yt_tgt: str,
    yt_ref: str,
    total_dur: float,
    setlists: List[Dict[str, Any]],
    coarse_step: float = DEFAULT_COARSE_STEP,
    initial_offset_hint: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Pass 1: Builds the macro skeleton of bounded frames [start, end, offset].
    Iterates forward along the target video with coarse steps, verifying signal continuity
    and recovering downstream setlist anchors when cuts occur.
    """
    logger.info(f"📍 [Pass 1] Generating Coarse Landmark Frames (step={coarse_step}s, dur={total_dur}s)...")

    # 1. Discover Initial Offset
    init_offset = initial_offset_hint
    if init_offset is None:
        init_res = find_setlist_landmark(yt_tgt, yt_ref, 15.0, 0.0, setlists[:10], max_window=1800.0)
        if init_res["success"]:
            init_offset = init_res["offset"]
        else:
            # Fallback probe at t=15s with 0.0 offset
            p0 = probe_local(yt_tgt, yt_ref, 15.0, 0.0, search_win=120.0)
            init_offset = p0["offset"] if p0["success"] else 0.0

    logger.info(f"  -> Discovered Initial Offset: {init_offset:+.2f}s")

    frames: List[Dict[str, Any]] = []
    curr_f_start = 0.0
    curr_off = init_offset
    t = coarse_step
    low_conf_count = 0

    while t < total_dur:
        p = probe_local(yt_tgt, yt_ref, t, curr_off, search_win=60.0)

        # Case A: Stable continuous signal with matching offset
        if p["success"] and abs(p["offset"] - curr_off) <= DRIFT_THRESHOLD:
            low_conf_count = 0
            t += coarse_step
            continue

        # Case B: Offset drifted within local probe window
        if p["success"] and abs(p["offset"] - curr_off) > DRIFT_THRESHOLD:
            # 2-step verification probe 10s ahead to avoid reverb / false correlation spikes
            p_verify = probe_local(
                yt_tgt, yt_ref, max(0.0, min(total_dur - 8.0, t + 10.0)), p["offset"], search_win=40.0
            )
            if p_verify["success"] and abs(p_verify["offset"] - p["offset"]) <= 0.8:
                frames.append({
                    "start": curr_f_start,
                    "end": t,
                    "offset": curr_off
                })
                logger.info(f"  -> Coarse Frame: [{curr_f_start:6.1f}s ~ {t:6.1f}s] off={curr_off:+8.2f}s")
                curr_f_start = t
                curr_off = p["offset"]
                low_conf_count = 0
                t += coarse_step
                continue

        # Case C: Low confidence signal -> Trigger downstream setlist anchor recovery
        low_conf_count += 1
        if low_conf_count >= 2:
            min_m = max(0.0, curr_f_start + curr_off - 10.0)
            rec = find_setlist_landmark(yt_tgt, yt_ref, t, min_m, setlists, max_window=2700.0)
            if rec["success"] and abs(rec["offset"] - curr_off) > DRIFT_THRESHOLD:
                p_verify = probe_local(
                    yt_tgt, yt_ref, max(0.0, min(total_dur - 8.0, t + 10.0)), rec["offset"], search_win=40.0
                )
                if p_verify["success"] and abs(p_verify["offset"] - rec["offset"]) <= 1.0:
                    frames.append({
                        "start": curr_f_start,
                        "end": t,
                        "offset": curr_off
                    })
                    logger.info(
                        f"  -> Coarse Frame (via {rec['name']}): [{curr_f_start:6.1f}s ~ {t:6.1f}s] off={curr_off:+8.2f}s"
                    )
                    curr_f_start = t
                    curr_off = rec["offset"]
                    low_conf_count = 0
                    t += coarse_step
                    continue

        t += coarse_step

    # Emit closing frame
    frames.append({
        "start": curr_f_start,
        "end": total_dur,
        "offset": curr_off
    })
    logger.info(f"✅ Pass 1 Generated {len(frames)} Coarse Bounded Frames.\n")
    return frames


def pass2_refine_bounded_frame(
    yt_tgt: str,
    yt_ref: str,
    t_start: float,
    t_end: float,
    base_offset: float,
    depth: int = 0,
    max_depth: int = MAX_RECURSION_DEPTH,
    min_dur: float = MIN_SEGMENT_DUR,
    drift_thresh: float = DRIFT_THRESHOLD,
    search_win: float = DEFAULT_SEARCH_WINDOW
) -> List[Dict[str, Any]]:
    """
    Pass 2: Refines strictly inside [t_start, t_end].
    Local search is strictly bounded within base_offset +/- search_win/2, preventing
    cross-song drift or global confusion.
    """
    duration = t_end - t_start

    # Terminal condition
    if duration < min_dur or depth >= max_depth:
        p_mid = (t_start + t_end) / 2.0
        r_mid = probe_local(yt_tgt, yt_ref, p_mid, base_offset, search_win)
        off = r_mid["offset"] if r_mid["success"] else base_offset
        return [{
            "video_start_time": t_start,
            "video_end_time": t_end,
            "sync_offset": round(off, 2),
            "confidence": r_mid.get("conf", 0.0),
            "depth": depth
        }]

    margin = min(6.0, duration * 0.1)
    p_left = t_start + margin
    p_right = max(p_left + 4.0, t_end - margin)

    r_left = probe_local(yt_tgt, yt_ref, p_left, base_offset, search_win)
    r_right = probe_local(yt_tgt, yt_ref, p_right, base_offset, search_win)

    if r_left["success"] and r_right["success"]:
        drift = abs(r_right["offset"] - r_left["offset"])
        if drift <= drift_thresh:
            avg_off = round((r_left["offset"] + r_right["offset"]) / 2.0, 2)
            avg_conf = round((r_left["conf"] + r_right["conf"]) / 2.0, 3)
            return [{
                "video_start_time": t_start,
                "video_end_time": t_end,
                "sync_offset": avg_off,
                "confidence": avg_conf,
                "depth": depth
            }]
        else:
            # 5-step bisection cut localization
            cut_t = binary_search_cut_boundary(
                yt_tgt, yt_ref, p_left, p_right, r_left["offset"], r_right["offset"], steps=5
            )
            cut_t = max(t_start + 4.0, min(t_end - 4.0, cut_t))
            l_segs = pass2_refine_bounded_frame(
                yt_tgt, yt_ref, t_start, cut_t, r_left["offset"],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            r_segs = pass2_refine_bounded_frame(
                yt_tgt, yt_ref, cut_t, t_end, r_right["offset"],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            return l_segs + r_segs

    # Fallback midpoint split if one probe failed
    p_mid = (t_start + t_end) / 2.0
    l_off = r_left["offset"] if r_left["success"] else base_offset
    r_off = r_right["offset"] if r_right["success"] else base_offset

    l_segs = pass2_refine_bounded_frame(
        yt_tgt, yt_ref, t_start, p_mid, l_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    r_segs = pass2_refine_bounded_frame(
        yt_tgt, yt_ref, p_mid, t_end, r_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    return l_segs + r_segs


def run_two_pass_pipeline(
    yt_tgt: str = "",
    yt_ref: str = "",
    total_dur: float = 0.0,
    setlists: Optional[List[Dict[str, Any]]] = None,
    coarse_frames: Optional[List[Dict[str, Any]]] = None,
    coarse_step: float = DEFAULT_COARSE_STEP,
    search_win: float = DEFAULT_SEARCH_WINDOW,
    yt_target: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Executes the end-to-end Two-Pass Segmentation Pipeline:
    - If coarse_frames is None (Mode A: Zero-Knowledge), executes Pass 1 to find coarse frames.
    - If coarse_frames is provided (Mode B: Human/Pre-set Bounded), directly runs Pass 2 within each frame.
    - Executes Pass 2 on each bounded frame.
    - Automatically merges adjacent sub-segments with |delta_offset| <= 0.4s.
    """
    target_yt = yt_target or yt_tgt
    setlists = setlists or []

    # 1. Obtain coarse frames
    if coarse_frames is None:
        frames = pass1_generate_coarse_frames(
            target_yt, yt_ref, total_dur, setlists, coarse_step=coarse_step
        )
    else:
        logger.info(f"📋 [Mode B] Utilizing {len(coarse_frames)} pre-defined bounded frames.")
        frames = coarse_frames

    # 2. Pass 2: Refine each frame strictly within bounds
    logger.info(f"🔬 [Pass 2] Refining {len(frames)} bounded frames...")
    all_micro_segs: List[Dict[str, Any]] = []
    for idx, f in enumerate(frames):
        s_t = f["start"]
        e_t = f["end"]
        b_off = f["offset"]
        segs = pass2_refine_bounded_frame(
            target_yt, yt_ref, s_t, e_t, b_off,
            depth=0, max_depth=MAX_RECURSION_DEPTH, search_win=search_win
        )
        all_micro_segs.extend(segs)

    # 3. Merge adjacent continuous sub-segments
    merged_segs = merge_adjacent_segments(all_micro_segs, max_offset_diff=0.4)
    logger.info(
        f"🎯 [Two-Pass Complete] Reduced {len(all_micro_segs)} raw partitions to {len(merged_segs)} merged segments."
    )
    return merged_segs


def calibrate_video_with_two_pass(
    db: Session,
    video_id: int,
    mode: str = "auto",
    custom_frames: Optional[List[Dict[str, Any]]] = None,
    force: bool = False,
    commit: bool = True
) -> Dict[str, Any]:
    """
    Production entry point for Two-Pass calibration of a video.
    Safeguards:
    - Preserves is_verified Ground Truth segments unless force=True.
    - Mode A ('auto'): Pure Zero-Knowledge (Pass 1 -> Pass 2).
    - Mode B ('bounded'): Human or Pre-set frames -> Pass 2 bounded refinement.
    - Writes resulting VideoSyncSegment records and updates calibration metrics.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return {"success": False, "error": f"Video #{video_id} not found."}

    # Resolve Master Video (long concert master > 1 hour)
    master_video = db.query(Video).filter(
        Video.concert_id == video.concert_id,
        Video.id != video.id,
        Video.is_unavailable == False,
        Video.duration > 3600
    ).order_by(Video.duration.desc()).first()

    if not master_video:
        master_video = db.query(Video).filter(
            Video.concert_id == video.concert_id,
            Video.id != video.id,
            Video.is_unavailable == False
        ).order_by(Video.duration.desc()).first()

    if not master_video:
        return {"success": False, "error": f"No master video found for concert {video.concert_id}."}

    yt_target = video.youtube_id
    yt_master = master_video.youtube_id
    total_dur = float(video.duration or 300.0)

    # Load Setlists
    setlist_rows = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == video.concert_id
    ).order_by(ConcertSetlist.start_time).all()
    setlists_dict = [
        {
            "id": s.id,
            "song_id": s.song_id,
            "start_time": s.start_time,
            "name": s.song.name if s.song else (s.event_name or "Unknown")
        }
        for s in setlist_rows
    ]

    def find_setlist_match(m_start: float, m_end: float) -> Tuple[Optional[int], Optional[str]]:
        for s in setlists_dict:
            if s["start_time"] is not None:
                if (
                    abs(s["start_time"] - m_start) < 45.0
                    or (s["start_time"] >= m_start - 10.0 and s["start_time"] <= m_end)
                    or (0.0 <= m_start - s["start_time"] <= 210.0)
                ):
                    return s["id"], s["name"]
        return None, None

    # Check for Ground Truth protection
    existing_segs = db.query(VideoSyncSegment).filter(
        VideoSyncSegment.video_id == video_id
    ).order_by(VideoSyncSegment.video_start_time).all()

    has_verified = any(s.is_verified for s in existing_segs)
    if has_verified and not force:
        logger.warning(
            f"🛡️ Video #{video_id} contains verified Ground Truth segments. Skipping automatic overwrite."
        )
        return {
            "success": True,
            "skipped": True,
            "message": f"Video #{video_id} contains verified Ground Truth segments. Automatic overwrite skipped to protect GT.",
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

    # Determine Bounded Frames
    coarse_input = None
    if custom_frames is not None and len(custom_frames) > 0:
        coarse_input = custom_frames
    elif mode == "bounded" and existing_segs:
        coarse_input = [
            {
                "start": s.video_start_time,
                "end": s.video_end_time,
                "offset": s.sync_offset
            }
            for s in existing_segs
        ]

    # Run Two-Pass Pipeline
    final_segments = run_two_pass_pipeline(
        yt_target=yt_target,
        yt_ref=yt_master,
        total_dur=total_dur,
        setlists=setlists_dict,
        coarse_frames=coarse_input
    )

    # Database Persistence
    db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video_id).delete()
    created_records = []
    for leaf in final_segments:
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
            is_verified=False  # Auto-generated segments are marked unverified by default
        )
        db.add(new_s)
        created_records.append(new_s)

    primary_offset = created_records[0].sync_offset if created_records else (video.sync_offset or 0.0)
    record_video_calibration(
        db,
        video,
        sync_offset=primary_offset,
        method="two_pass_hybrid_zero_knowledge",
        status="split_segmented" if len(created_records) > 1 else "ai_calibrated",
        commit=False
    )
    if commit:
        db.commit()
    else:
        db.flush()

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
