"""
Continuity Gatekeeper Service
-----------------------------
Fast-path triage for single-song candidate fancams.
Performs 3-Point Acoustic Triangulation (Start, Mid, End) against a reference timeline
(Master video or calibrated Peer Anchor) to determine whether a fancam is a single
unbroken one-take or contains internal jump cuts.

Complexity: O(3) audio slices = ~2.0 seconds total evaluation.
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
from app.services.audio_dsp import probe_acoustic_match

logger = logging.getLogger(__name__)

DEFAULT_GATE_TOLERANCE = 1.0  # Max offset deviation (seconds) to certify one-take


def evaluate_3point_continuity(
    yt_tgt: str,
    yt_ref: str,
    duration: float,
    expected_offset: float,
    search_radius: float = 120.0,
    tolerance: float = DEFAULT_GATE_TOLERANCE
) -> Dict[str, Any]:
    """
    Probes Start (5s), Mid (dur/2), and End (dur-5s) to certify continuity.

    Returns:
        Dict containing:
        - 'is_continuous': bool
        - 'verdict': 'continuous_one_take' | 'cut_in_first_half' | 'cut_in_second_half' | 'multiple_cuts_or_medley' | 'insufficient_signal'
        - 'mean_offset': float (if continuous)
        - 'recommended_split_window': Tuple[float, float] (time span containing cut for bisection)
        - 'probes': List of probe details
    """
    dur = max(15.0, float(duration))
    if dur < 600.0:
        test_points = [
            ("start", max(2.0, min(10.0, dur * 0.1))),
            ("mid", dur / 2.0),
            ("end", max(dur - 10.0, dur * 0.9))
        ]
    else:
        test_points = [
            ("start", dur * 0.15),
            ("mid", dur * 0.50),
            ("end", dur * 0.85)
        ]

    probes = []
    offsets = []

    for tag, t_local in test_points:
        est_ref = max(0.0, t_local + expected_offset)
        res = probe_acoustic_match(
            yt_tgt=yt_tgt,
            yt_ref=yt_ref,
            t_tgt=t_local,
            est_ref_t=est_ref,
            search_radius=search_radius,
            dur=8.0,
            prefix=f"gate_{tag}"
        )
        if res["success"]:
            off = res["relative_offset"]
            probes.append({
                "tag": tag,
                "t_local": t_local,
                "offset": off,
                "conf": res["confidence"]
            })
            offsets.append(off)
        else:
            probes.append({
                "tag": tag,
                "t_local": t_local,
                "offset": None,
                "conf": res["confidence"]
            })

    if len(offsets) < 2:
        return {
            "is_continuous": False,
            "verdict": "insufficient_signal",
            "mean_offset": None,
            "recommended_split_window": None,
            "probes": probes
        }

    # If only 2 points succeeded, evaluate pair
    if len(offsets) == 2:
        diff = abs(offsets[0] - offsets[1])
        if diff <= tolerance:
            mean_off = round(sum(offsets) / len(offsets), 3)
            return {
                "is_continuous": True,
                "verdict": "continuous_one_take",
                "mean_offset": mean_off,
                "recommended_split_window": None,
                "probes": probes
            }
        else:
            return {
                "is_continuous": False,
                "verdict": "cut_detected_partial",
                "mean_offset": None,
                "recommended_split_window": (0.0, dur),
                "probes": probes
            }

    # All 3 points succeeded
    o_start, o_mid, o_end = offsets[0], offsets[1], offsets[2]
    d_start_mid = abs(o_start - o_mid)
    d_mid_end = abs(o_mid - o_end)
    d_total = max(offsets) - min(offsets)

    if d_total <= tolerance:
        return {
            "is_continuous": True,
            "verdict": "continuous_one_take",
            "mean_offset": round(sum(offsets) / 3.0, 3),
            "recommended_split_window": None,
            "probes": probes
        }

    # Jump cut localization hint
    if d_start_mid <= tolerance and d_mid_end > tolerance:
        return {
            "is_continuous": False,
            "verdict": "cut_in_second_half",
            "mean_offset": None,
            "recommended_split_window": (round(dur / 2.0, 2), round(dur, 2)),
            "probes": probes
        }
    elif d_start_mid > tolerance and d_mid_end <= tolerance:
        return {
            "is_continuous": False,
            "verdict": "cut_in_first_half",
            "mean_offset": None,
            "recommended_split_window": (0.0, round(dur / 2.0, 2)),
            "probes": probes
        }
    else:
        return {
            "is_continuous": False,
            "verdict": "multiple_cuts_or_medley",
            "mean_offset": None,
            "recommended_split_window": (0.0, round(dur, 2)),
            "probes": probes
        }
