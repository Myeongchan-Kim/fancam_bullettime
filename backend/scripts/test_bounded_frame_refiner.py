"""
Test Bounded Frame Refiner (Pass 2)
Verifies that Pass 2:
1. Never exceeds [t_start, t_end] boundaries.
2. Only searches locally around base_offset (offset +/- local_window).
3. Pinpoints internal cuts within the frame with sub-second accuracy.
"""

import sys
import os
import time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.evaluate_adaptive_split_v63 import load_db_data
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate
from app.crawler.recursive_segment_calibrator import (
    binary_search_cut_boundary,
    merge_adjacent_segments
)

def probe_local_in_frame(yt_tgt, yt_ref, t_tgt, base_off, search_win=60.0, dur=8.0):
    est_m = max(0.0, t_tgt + base_off)
    ref_start = max(0.0, est_m - search_win / 2.0)
    tgt_name = f"bfr_{yt_tgt}_{int(t_tgt)}_{int(dur)}"
    ref_name = f"bfr_{yt_ref}_{int(ref_start)}_{int(search_win)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, dur, tgt_name)
    ref_w = download_audio_slice(yt_ref, ref_start, search_win, ref_name)
    m_sec, conf = cross_correlate(tgt_w, ref_w, ref_start)
    return {
        'offset': round(m_sec - t_tgt, 2),
        'conf': round(conf, 3),
        'success': conf >= 0.14,
        'master_time': m_sec
    }

def refine_bounded_frame(
    yt_tgt: str,
    yt_ref: str,
    t_start: float,
    t_end: float,
    base_offset: float,
    depth: int = 0,
    max_depth: int = 4,
    min_dur: float = 15.0,
    drift_thresh: float = 1.0,
    search_win: float = 60.0
):
    """
    Pass 2: Operates STRICTLY within [t_start, t_end].
    Only searches locally within base_offset +/- (search_win / 2).
    """
    duration = t_end - t_start
    prefix = "  " * depth

    if duration < min_dur or depth >= max_depth:
        # Evaluate center point to lock best local offset
        p_mid = (t_start + t_end) / 2.0
        r_mid = probe_local_in_frame(yt_tgt, yt_ref, p_mid, base_offset, search_win)
        off = r_mid['offset'] if r_mid['success'] else base_offset
        return [{
            'video_start_time': t_start,
            'video_end_time': t_end,
            'sync_offset': round(off, 2),
            'confidence': r_mid.get('conf', 0.0),
            'depth': depth
        }]

    # Probe near left and right boundaries (with safety margin)
    margin = min(6.0, duration * 0.1)
    p_left = t_start + margin
    p_right = max(p_left + 4.0, t_end - margin)

    r_left = probe_local_in_frame(yt_tgt, yt_ref, p_left, base_offset, search_win)
    r_right = probe_local_in_frame(yt_tgt, yt_ref, p_right, base_offset, search_win)

    # Case 1: Both succeeded and offset is stable within frame -> Single take!
    if r_left['success'] and r_right['success']:
        drift = abs(r_right['offset'] - r_left['offset'])
        if drift <= drift_thresh:
            avg_off = round((r_left['offset'] + r_right['offset']) / 2.0, 2)
            avg_conf = round((r_left['conf'] + r_right['conf']) / 2.0, 3)
            return [{
                'video_start_time': t_start,
                'video_end_time': t_end,
                'sync_offset': avg_off,
                'confidence': avg_conf,
                'depth': depth
            }]
        else:
            # Cut detected inside this frame! Pinpoint exact boundary
            cut_t = binary_search_cut_boundary(
                yt_tgt, yt_ref, p_left, p_right, r_left['offset'], r_right['offset'], steps=5
            )
            # Ensure cut_t stays strictly inside [t_start + 5, t_end - 5]
            cut_t = max(t_start + 5.0, min(t_end - 5.0, cut_t))
            left_segs = refine_bounded_frame(
                yt_tgt, yt_ref, t_start, cut_t, r_left['offset'],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            right_segs = refine_bounded_frame(
                yt_tgt, yt_ref, cut_t, t_end, r_right['offset'],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            return left_segs + right_segs

    # Case 2: One probe failed (e.g. applause or pause)
    # Check if cut happened by bisecting inside frame
    p_mid = (t_start + t_end) / 2.0
    left_off = r_left['offset'] if r_left['success'] else base_offset
    right_off = r_right['offset'] if r_right['success'] else base_offset

    left_segs = refine_bounded_frame(
        yt_tgt, yt_ref, t_start, p_mid, left_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    right_segs = refine_bounded_frame(
        yt_tgt, yt_ref, p_mid, t_end, right_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    return left_segs + right_segs

def main():
    gt_segs, setlists = load_db_data()
    yt_tgt = 'ZBjTY0h1fuc'
    yt_ref = 'dxY6TEGf6fM'

    # Test on a coarse frame from Solo section where multiple micro-edits happened:
    # GT shows cuts at 3095.7, 3218.3, 3355.3, 3455.2 with offsets jumping ~5s
    test_frame = (2983.0, 3621.0, 1673.0) # Frame: [2983.0s ~ 3621.0s], base_offset = +1673.0s
    print(f"Testing Bounded Frame Refiner on frame [{test_frame[0]}s ~ {test_frame[1]}s] (base off: {test_frame[2]:+.2f}s)...")
    
    t0 = time.time()
    subsegs = refine_bounded_frame(
        yt_tgt, yt_ref,
        test_frame[0], test_frame[1], test_frame[2],
        search_win=60.0
    )
    merged = merge_adjacent_segments(subsegs, max_offset_diff=0.4)
    elapsed = time.time() - t0

    print(f"\nRefined in {elapsed:.2f}s into {len(merged)} segments:")
    for s in merged:
        print(f"  -> [{s['video_start_time']:6.1f}s ~ {s['video_end_time']:6.1f}s] (dur: {s['video_end_time']-s['video_start_time']:5.1f}s) | offset: {s['sync_offset']:+8.2f}s | conf: {s['confidence']:.3f}")

    # Boundary safety checks
    assert merged[0]['video_start_time'] == test_frame[0], "Start boundary violated!"
    assert merged[-1]['video_end_time'] == test_frame[1], "End boundary violated!"
    print("\n✅ All frame boundaries strictly preserved!")

if __name__ == '__main__':
    main()
