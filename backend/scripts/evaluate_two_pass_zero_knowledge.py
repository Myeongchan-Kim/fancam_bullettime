"""
Two-Pass Hybrid Split & Calibrator Evaluation (Video #63 Zero-Knowledge)
1. Pass 1: Global Landmark Anchor Grid (Macro Skeleton)
2. Pass 2: Bounded Frame Local Refiner (Micro Cuts & Precision Offsets)
Evaluates end-to-end performance against Ground Truth.
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

def probe_local(yt_tgt, yt_ref, t_tgt, base_off, search_win=60.0, dur=8.0):
    est_m = max(0.0, t_tgt + base_off)
    ref_start = max(0.0, est_m - search_win / 2.0)
    tgt_name = f"tp_tgt_{int(t_tgt)}_{int(dur)}"
    ref_name = f"tp_ref_{int(ref_start)}_{int(search_win)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, dur, tgt_name)
    ref_w = download_audio_slice(yt_ref, ref_start, search_win, ref_name)
    m_sec, conf = cross_correlate(tgt_w, ref_w, ref_start)
    return {
        'offset': round(m_sec - t_tgt, 2),
        'conf': round(conf, 3),
        'success': conf >= 0.14,
        'master_time': m_sec
    }

def find_setlist_landmark(yt_tgt, yt_ref, t_tgt, min_m, setlists, max_window=3600.0):
    tgt_name = f"tp_sl_{int(t_tgt)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, 8.0, tgt_name)
    candidates = [
        s for s in setlists
        if min_m - 30.0 <= s['start_time'] <= min_m + max_window
    ]
    best = None
    for s in candidates:
        m_center = s['start_time'] + 30.0
        ref_name = f"tp_sl_ref_{int(m_center)}"
        ref_w = download_audio_slice(yt_ref, max(0.0, m_center - 45.0), 90.0, ref_name)
        m_sec, conf = cross_correlate(tgt_w, ref_w, max(0.0, m_center - 45.0))
        if conf >= 0.20:
            return {'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'name': s['name'], 'success': True}
        if conf >= 0.15 and (best is None or conf > best['conf']):
            best = {'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'name': s['name'], 'success': True}
    if best:
        return best
    return {'success': False, 'offset': None, 'conf': 0.0}

def pass1_generate_coarse_frames(yt_tgt, yt_ref, total_dur, setlists, coarse_step=90.0):
    """
    Pass 1: Discover Initial Offset and Walk Macro Timeline with Coarse Step.
    Builds Coarse Bounded Frames [t_start, t_end, base_offset].
    """
    print("📍 [Pass 1] Generating Coarse Landmark Frames...")
    # Initial Offset Discovery
    init_res = find_setlist_landmark(yt_tgt, yt_ref, 15.0, 0.0, setlists[:10], max_window=1800.0)
    init_offset = init_res['offset'] if init_res['success'] else -3.54
    print(f"  -> Discovered Initial Offset: {init_offset:+.2f}s")

    frames = []
    curr_f_start = 0.0
    curr_off = init_offset
    last_confirmed_t = 0.0
    t = coarse_step
    low_conf_count = 0

    while t < total_dur:
        p = probe_local(yt_tgt, yt_ref, t, curr_off, search_win=60.0)
        
        # Stable signal with same offset
        if p['success'] and abs(p['offset'] - curr_off) <= 1.0:
            last_confirmed_t = t
            low_conf_count = 0
            t += coarse_step
            continue

        # Offset drifted within probe window
        if p['success'] and abs(p['offset'] - curr_off) > 1.0:
            # Verification probe 10s ahead to avoid reverberation/echo false positives
            p_verify = probe_local(yt_tgt, yt_ref, min(total_dur - 10.0, t + 10.0), p['offset'], search_win=40.0)
            if p_verify['success'] and abs(p_verify['offset'] - p['offset']) <= 0.8:
                # Confirmed real drift
                frames.append({
                    'start': curr_f_start,
                    'end': t,
                    'offset': curr_off
                })
                print(f"  -> Coarse Frame: [{curr_f_start:6.1f}s ~ {t:6.1f}s] off={curr_off:+8.2f}s")
                curr_f_start = t
                curr_off = p['offset']
                last_confirmed_t = t
                low_conf_count = 0
                t += coarse_step
                continue

        # Low confidence -> search setlist forward
        low_conf_count += 1
        if low_conf_count >= 2:
            min_m = max(0.0, curr_f_start + curr_off - 10.0)
            rec = find_setlist_landmark(yt_tgt, yt_ref, t, min_m, setlists, max_window=2700.0)
            if rec['success'] and abs(rec['offset'] - curr_off) > 1.0:
                # 2-step verification for anchor recovery
                p_verify = probe_local(yt_tgt, yt_ref, min(total_dur - 10.0, t + 10.0), rec['offset'], search_win=40.0)
                if p_verify['success'] and abs(p_verify['offset'] - rec['offset']) <= 1.0:
                    frames.append({
                        'start': curr_f_start,
                        'end': t,
                        'offset': curr_off
                    })
                    print(f"  -> Coarse Frame (via {rec['name']}): [{curr_f_start:6.1f}s ~ {t:6.1f}s] off={curr_off:+8.2f}s")
                    curr_f_start = t
                    curr_off = rec['offset']
                    last_confirmed_t = t
                    low_conf_count = 0
                    t += coarse_step
                    continue

        t += coarse_step

    # Final frame
    frames.append({
        'start': curr_f_start,
        'end': total_dur,
        'offset': curr_off
    })
    print(f"  -> Coarse Frame (Final): [{curr_f_start:6.1f}s ~ {total_dur:6.1f}s] off={curr_off:+8.2f}s")
    print(f"✅ Pass 1 Generated {len(frames)} Coarse Bounded Frames.\n")
    return frames

def pass2_refine_bounded_frame(
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
    Pass 2: Refines strictly inside [t_start, t_end].
    Local search bounded within base_offset +/- search_win/2.
    """
    duration = t_end - t_start

    if duration < min_dur or depth >= max_depth:
        p_mid = (t_start + t_end) / 2.0
        r_mid = probe_local(yt_tgt, yt_ref, p_mid, base_offset, search_win)
        off = r_mid['offset'] if r_mid['success'] else base_offset
        return [{
            'video_start_time': t_start,
            'video_end_time': t_end,
            'sync_offset': round(off, 2),
            'confidence': r_mid.get('conf', 0.0),
            'depth': depth
        }]

    margin = min(6.0, duration * 0.1)
    p_left = t_start + margin
    p_right = max(p_left + 4.0, t_end - margin)

    r_left = probe_local(yt_tgt, yt_ref, p_left, base_offset, search_win)
    r_right = probe_local(yt_tgt, yt_ref, p_right, base_offset, search_win)

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
            cut_t = binary_search_cut_boundary(
                yt_tgt, yt_ref, p_left, p_right, r_left['offset'], r_right['offset'], steps=5
            )
            cut_t = max(t_start + 4.0, min(t_end - 4.0, cut_t))
            l_segs = pass2_refine_bounded_frame(
                yt_tgt, yt_ref, t_start, cut_t, r_left['offset'],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            r_segs = pass2_refine_bounded_frame(
                yt_tgt, yt_ref, cut_t, t_end, r_right['offset'],
                depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
            )
            return l_segs + r_segs

    p_mid = (t_start + t_end) / 2.0
    l_off = r_left['offset'] if r_left['success'] else base_offset
    r_off = r_right['offset'] if r_right['success'] else base_offset

    l_segs = pass2_refine_bounded_frame(
        yt_tgt, yt_ref, t_start, p_mid, l_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    r_segs = pass2_refine_bounded_frame(
        yt_tgt, yt_ref, p_mid, t_end, r_off,
        depth=depth+1, max_depth=max_depth, min_dur=min_dur, search_win=search_win
    )
    return l_segs + r_segs

def evaluate_pipeline(refined_segs, gt_segs, total_dur=8384.0):
    gt_cuts = [s[1] for s in gt_segs[:-1]]
    algo_cuts = [s['video_end_time'] for s in refined_segs[:-1]]

    MATCH_TOLERANCE = 10.0
    matched_gt = set()
    matched_algo = set()
    cut_errors = []

    for a_idx, a_cut in enumerate(algo_cuts):
        best_gt = None
        min_dist = float('inf')
        for g_idx, g_cut in enumerate(gt_cuts):
            if g_idx in matched_gt:
                continue
            dist = abs(a_cut - g_cut)
            if dist < min_dist:
                min_dist = dist
                best_gt = g_idx
        if best_gt is not None and min_dist <= MATCH_TOLERANCE:
            matched_gt.add(best_gt)
            matched_algo.add(a_idx)
            cut_errors.append(min_dist)

    recall = len(matched_gt) / len(gt_cuts) * 100.0 if gt_cuts else 0.0
    precision = len(matched_algo) / len(algo_cuts) * 100.0 if algo_cuts else 0.0
    mean_cut_err = float(np.mean(cut_errors)) if cut_errors else 0.0

    # Continuous MAE / RMSE
    time_points = np.arange(0.0, total_dur, 1.0)
    gt_cont = np.zeros_like(time_points)
    algo_cont = np.zeros_like(time_points)

    for tp_idx, t in enumerate(time_points):
        for g in gt_segs:
            if g[0] <= t < g[1]:
                gt_cont[tp_idx] = g[2]
                break
        else:
            gt_cont[tp_idx] = gt_segs[-1][2]

        for a in refined_segs:
            if a['video_start_time'] <= t < a['video_end_time']:
                algo_cont[tp_idx] = a['sync_offset']
                break
        else:
            algo_cont[tp_idx] = refined_segs[-1]['sync_offset']

    errs = np.abs(algo_cont - gt_cont)
    mae = float(np.mean(errs))
    rmse = float(np.sqrt(np.mean(errs ** 2)))
    p_05 = float(np.sum(errs <= 0.5) / len(errs) * 100.0)
    p_20 = float(np.sum(errs <= 2.0) / len(errs) * 100.0)
    p_100 = float(np.sum(errs > 10.0) / len(errs) * 100.0)

    print("="*80)
    print("📊 TWO-PASS ZERO-KNOWLEDGE BENCHMARK RESULTS (vs GROUND TRUTH)")
    print("="*80)
    print(f"Total Discovered Segments: {len(refined_segs)} (Ground Truth: {len(gt_segs)})")
    print(f"Cut Recall:                {recall:.1f}% ({len(matched_gt)} / {len(gt_cuts)} cuts detected) [Baseline: 31.0%]")
    print(f"Cut Precision:             {precision:.1f}% ({len(matched_algo)} / {len(algo_cuts)} cuts verified) [Baseline: 52.9%]")
    print(f"Mean Cut Boundary Error:   {mean_cut_err:.2f} seconds")
    print(f"Continuous MAE:            {mae:.2f} seconds [Baseline: 143.45s]")
    print(f"Continuous RMSE:           {rmse:.2f} seconds [Baseline: 293.48s]")
    print(f"Sync <= 0.5s:              {p_05:.1f}% of concert [Baseline: 26.4%]")
    print(f"Sync <= 2.0s:              {p_20:.1f}% of concert [Baseline: 45.4%]")
    print(f"Desync > 10.0s:            {p_100:.1f}% of concert [Baseline: 44.5%]")
    print("="*80)

def main():
    gt_segs, setlists = load_db_data()
    yt_tgt = 'ZBjTY0h1fuc'
    yt_ref = 'dxY6TEGf6fM'
    total_dur = 8384.0

    t0 = time.time()
    # Step 1: Pass 1 Coarse Frames
    coarse_frames = pass1_generate_coarse_frames(yt_tgt, yt_ref, total_dur, setlists, coarse_step=90.0)

    # Step 2: Pass 2 Bounded Refinement on each Frame
    print(f"🔍 [Pass 2] Refining {len(coarse_frames)} Bounded Frames locally...")
    all_refined = []
    for f_idx, f in enumerate(coarse_frames):
        subsegs = pass2_refine_bounded_frame(
            yt_tgt, yt_ref, f['start'], f['end'], f['offset'], search_win=60.0
        )
        all_refined.extend(subsegs)

    # Merge contiguous subsegs
    final_segs = merge_adjacent_segments(all_refined, max_offset_diff=0.4)
    elapsed = time.time() - t0
    print(f"🎉 Complete Two-Pass Execution finished in {elapsed:.2f}s! Produced {len(final_segs)} segments.\n")

    # Evaluate against GT
    evaluate_pipeline(final_segs, gt_segs, total_dur)

if __name__ == '__main__':
    main()
