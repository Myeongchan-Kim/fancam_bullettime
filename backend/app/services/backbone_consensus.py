"""
Backbone Consensus & Physical Invariant Continuity Engine
---------------------------------------------------------
Enforces physical time invariance (dT/dt = 1.0) across concurrent video recordings.
In the absence of a setlist or pre-existing master timeline, compares the relative
elapsed time (Δt) between two videos across shared acoustic landmarks:

Δt1 = t1(L_B) - t1(L_A)
Δt2 = t2(L_B) - t2(L_A)

- |Δt1 - Δt2| <= tolerance: Both videos continuous.
- Δt1 > Δt2: Video 2 paused / jumped by (Δt1 - Δt2) seconds; Video 1 is continuous.
- Δt2 > Δt1: Video 1 paused / jumped by (Δt2 - Δt1) seconds; Video 2 is continuous.

Synthesizes the piecewise continuous Virtual Master Spine from the longest unbroken spans.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from app.services.audio_dsp import probe_acoustic_match

logger = logging.getLogger(__name__)

DEFAULT_DRIFT_TOLERANCE = 0.40  # seconds


def compare_relative_elapsed_time(
    t1_a: float, t1_b: float,
    t2_a: float, t2_b: float,
    tolerance: float = DEFAULT_DRIFT_TOLERANCE
) -> Dict[str, Any]:
    """
    Compares elapsed time between two matched acoustic landmarks A and B across two videos.

    Args:
        t1_a: Timestamp of event A in Video 1 (seconds)
        t1_b: Timestamp of event B in Video 1 (seconds)
        t2_a: Timestamp of event A in Video 2 (seconds)
        t2_b: Timestamp of event B in Video 2 (seconds)
        tolerance: Maximum jitter/drift tolerance before declaring an internal cut (default 0.4s)

    Returns:
        Dict detailing continuity status, winner (unbroken video), and pause duration.
    """
    dt1 = t1_b - t1_a
    dt2 = t2_b - t2_a
    drift = dt1 - dt2

    if abs(drift) <= tolerance:
        return {
            "status": "both_continuous",
            "winner": "both",
            "cut_video": None,
            "dt1": round(dt1, 3),
            "dt2": round(dt2, 3),
            "pause_duration": 0.0,
            "drift": round(drift, 3)
        }
    elif drift > tolerance:
        # Video 1 elapsed longer -> Video 2 was paused/cut
        return {
            "status": "v2_cut_detected",
            "winner": "v1",
            "cut_video": "v2",
            "dt1": round(dt1, 3),
            "dt2": round(dt2, 3),
            "pause_duration": round(drift, 3),
            "drift": round(drift, 3)
        }
    else:
        # Video 2 elapsed longer -> Video 1 was paused/cut
        return {
            "status": "v1_cut_detected",
            "winner": "v2",
            "cut_video": "v1",
            "dt1": round(dt1, 3),
            "dt2": round(dt2, 3),
            "pause_duration": round(-drift, 3),
            "drift": round(drift, 3)
        }


def detect_pairwise_continuity(
    yt_v1: str,
    yt_v2: str,
    v1_checkpoints: List[float],
    base_offset_v2_to_v1: float,
    search_radius: float = 30.0,
    tolerance: float = DEFAULT_DRIFT_TOLERANCE
) -> List[Dict[str, Any]]:
    """
    Samples acoustic landmarks along Video 1, probes matching timestamps in Video 2,
    and runs pairwise continuity analysis on all consecutive intervals.

    Returns:
        List of interval evaluation dicts.
    """
    matched_pairs: List[Tuple[float, float, float]] = []  # (t_v1, t_v2, confidence)

    for t_v1 in v1_checkpoints:
        est_v2 = t_v1 - base_offset_v2_to_v1
        if est_v2 < 0:
            continue
        res = probe_acoustic_match(
            yt_tgt=yt_v1,
            yt_ref=yt_v2,
            t_tgt=t_v1,
            est_ref_t=est_v2,
            search_radius=search_radius,
            prefix="bb_probe"
        )
        if res["success"]:
            matched_pairs.append((t_v1, res["matched_ref_sec"], res["confidence"]))

    if len(matched_pairs) < 2:
        logger.warning(f"Insufficient matched pairs between {yt_v1} and {yt_v2} ({len(matched_pairs)} found)")
        return []

    intervals = []
    for i in range(len(matched_pairs) - 1):
        t1_a, t2_a, c_a = matched_pairs[i]
        t1_b, t2_b, c_b = matched_pairs[i + 1]

        eval_res = compare_relative_elapsed_time(t1_a, t1_b, t2_a, t2_b, tolerance)
        eval_res["interval_v1"] = (t1_a, t1_b)
        eval_res["interval_v2"] = (t2_a, t2_b)
        eval_res["confidence"] = round((c_a + c_b) / 2.0, 3)
        intervals.append(eval_res)

    return intervals


def build_composite_spine_segments(
    v1_id: int,
    v2_id: int,
    intervals: List[Dict[str, Any]],
    v1_initial_offset: float = 0.0
) -> List[Dict[str, Any]]:
    """
    Constructs virtual master spine segment intervals from pairwise interval comparisons.
    Uses the unpaused winner for each interval to advance the master clock monotonically.
    """
    if not intervals:
        return []

    spine_segments = []
    current_master_clock = v1_initial_offset

    for item in intervals:
        t1_a, t1_b = item["interval_v1"]
        t2_a, t2_b = item["interval_v2"]
        winner = item["winner"]
        
        # Duration that physical real time advanced
        dt_physical = max(item["dt1"], item["dt2"])

        seg = {
            "master_start": round(current_master_clock, 2),
            "master_end": round(current_master_clock + dt_physical, 2),
            "physical_duration": round(dt_physical, 2),
            "authoritative_video_id": v1_id if winner in ("both", "v1") else v2_id,
            "status": item["status"],
            "v1_span": (t1_a, t1_b),
            "v2_span": (t2_a, t2_b),
            "cut_video": item["cut_video"],
            "pause_duration": item["pause_duration"]
        }
        spine_segments.append(seg)
        current_master_clock += dt_physical

    return spine_segments
