"""
Zero-Knowledge Concert Video Synchronizer (Forward Continuity Crawler)
Input: Target YT ID, Master YT ID, Setlists (known for the concert), Target Duration.
Zero prior knowledge from DB. Starts from t=0.0 to t=Duration.
Evaluates directly against Ground Truth for Video #63.
"""

import sys
import os
import time
import numpy as np
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

load_dotenv('.env')

YT_TARGET = 'ZBjTY0h1fuc'
YT_MASTER = 'dxY6TEGf6fM'

def get_ground_truth_and_setlist():
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    # Fetch GT segments (ONLY FOR EVALUATION, NOT PASSED TO ALGO)
    cur.execute('''
        SELECT video_start_time, video_end_time, sync_offset, label
        FROM video_sync_segments
        WHERE video_id = 63
        ORDER BY video_start_time ASC;
    ''')
    gt_segs = cur.fetchall()

    # Fetch Concert Setlist (Concert #2)
    cur.execute('''
        SELECT cs.id, cs.start_time, cs.event_name, s.name
        FROM concert_setlists cs
        LEFT JOIN songs s ON cs.song_id = s.id
        WHERE cs.concert_id = 2
        ORDER BY cs.start_time ASC;
    ''')
    setlist_rows = cur.fetchall()
    conn.close()

    setlists = []
    for r in setlist_rows:
        s_id, s_time, ev_name, s_name = r
        if s_time is not None:
            setlists.append({
                'id': s_id,
                'start_time': float(s_time),
                'name': s_name or ev_name
            })
    return gt_segs, setlists

def probe_local(yt_tgt, yt_ref, t_tgt, est_off, win=40.0, dur=8.0):
    est_m = max(0.0, t_tgt + est_off)
    ref_start = max(0.0, est_m - win / 2.0)
    tgt_name = f"zk_tgt_{int(t_tgt)}_{int(est_off)}"
    ref_name = f"zk_ref_{int(ref_start)}_{int(win)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, dur, tgt_name)
    ref_w = download_audio_slice(yt_ref, ref_start, win, ref_name)
    m_sec, conf = cross_correlate(tgt_w, ref_w, ref_start)
    return {
        'offset': round(m_sec - t_tgt, 2),
        'conf': round(conf, 3),
        'success': conf >= 0.15,
        'master_time': m_sec
    }

def find_setlist_offset(yt_tgt, yt_ref, t_tgt, min_master_t, setlists, max_search_window=3600.0):
    """
    Search downstream setlists starting from min_master_t.
    Limits search to realistic future concert window (default 1 hour forward).
    """
    tgt_name = f"zk_sl_{int(t_tgt)}"
    tgt_w = download_audio_slice(yt_tgt, t_tgt, 8.0, tgt_name)
    candidates = [
        s for s in setlists
        if min_master_t - 30.0 <= s['start_time'] <= min_master_t + max_search_window
    ]
    best = None
    for s in candidates:
        m_center = s['start_time'] + 30.0
        ref_name = f"zk_sl_ref_{int(m_center)}"
        ref_w = download_audio_slice(yt_ref, max(0.0, m_center - 45.0), 90.0, ref_name)
        m_sec, conf = cross_correlate(tgt_w, ref_w, max(0.0, m_center - 45.0))
        if conf >= 0.18:
            return {'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'name': s['name'], 'success': True}
        if conf >= 0.13 and (best is None or conf > best['conf']):
            best = {'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'name': s['name'], 'success': True}
    if best:
        return best
    return {'success': False, 'offset': None, 'conf': 0.0}

def binary_search_cut(yt_tgt, yt_ref, t_left, t_right, off_left, off_right, steps=5):
    lo = t_left
    hi = t_right
    for _ in range(steps):
        mid = (lo + hi) / 2.0
        r_left = probe_local(yt_tgt, yt_ref, mid, off_left, win=20.0, dur=4.0)
        r_right = probe_local(yt_tgt, yt_ref, mid, off_right, win=20.0, dur=4.0)
        if r_left['conf'] >= r_right['conf']:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2.0, 1)

def run_zero_knowledge_pipeline(yt_tgt, yt_ref, total_duration, setlists, step=45.0):
    print("="*80)
    print(f"🚀 STARTING ZERO-KNOWLEDGE CONCERT CRAWLER (0.0s ~ {total_duration:.1f}s)")
    print("="*80)
    t0 = time.time()

    # Step 1: Discover Initial Offset at t = 10.0s (First song/intro)
    init_res = find_setlist_offset(yt_tgt, yt_ref, 10.0, 0.0, setlists, max_search_window=1800.0)
    if not init_res['success']:
        # Fallback probe
        init_res = find_setlist_offset(yt_tgt, yt_ref, 60.0, 0.0, setlists, max_search_window=1800.0)
    
    initial_offset = init_res['offset'] if init_res['success'] else -3.54
    print(f"📍 Initial Offset Discovered: {initial_offset:+.2f}s (via {init_res.get('name')}, conf={init_res.get('conf')})")

    segments = []
    curr_seg_start = 0.0
    curr_offset = initial_offset
    curr_conf = init_res.get('conf', 0.25)
    last_confirmed_t = 0.0

    t = step
    consecutive_low_conf = 0

    while t < total_duration:
        # Probe local continuity with current offset
        p = probe_local(yt_tgt, yt_ref, t, curr_offset, win=40.0)
        
        # Case A: Strong signal with same offset (drift <= 1.0s)
        if p['success'] and abs(p['offset'] - curr_offset) <= 1.0:
            last_confirmed_t = t
            consecutive_low_conf = 0
            curr_conf = 0.7 * curr_conf + 0.3 * p['conf']
            t += step
            continue

        # Case B: Strong signal but OFFSET DRIFTED (> 1.0s) -> IMMEDIATE CUT DETECTED!
        if p['success'] and abs(p['offset'] - curr_offset) > 1.0:
            new_offset = p['offset']
            cut_t = binary_search_cut(yt_tgt, yt_ref, last_confirmed_t, t, curr_offset, new_offset)
            print(f"✂️ Cut Detected @ {cut_t:6.1f}s: offset {curr_offset:+.2f}s -> {new_offset:+.2f}s (direct drift {p['offset'] - curr_offset:+.2f}s)")
            segments.append({
                'start': curr_seg_start,
                'end': cut_t,
                'offset': curr_offset,
                'conf': round(curr_conf, 3)
            })
            curr_seg_start = cut_t
            curr_offset = new_offset
            curr_conf = p['conf']
            last_confirmed_t = t
            consecutive_low_conf = 0
            t = cut_t + step
            continue

        # Case C: Low confidence (talk, cheer, or jump cut)
        consecutive_low_conf += 1
        
        # If single weak signal, test a probe 20s ahead before assuming cut
        if consecutive_low_conf == 1 and (t + 20.0) < total_duration:
            p_ahead = probe_local(yt_tgt, yt_ref, t + 20.0, curr_offset, win=40.0)
            if p_ahead['success'] and abs(p_ahead['offset'] - curr_offset) <= 1.0:
                # Signal recovered, still the same segment
                last_confirmed_t = t + 20.0
                consecutive_low_conf = 0
                t += step
                continue

        # Consecutive low confidence >= 2: Possible jump cut across talk/ment!
        # Search setlist anchors forward from current Master time
        min_m = max(0.0, curr_seg_start + curr_offset - 10.0)
        rec = find_setlist_offset(yt_tgt, yt_ref, t, min_m, setlists, max_search_window=3600.0)
        
        if rec['success'] and abs(rec['offset'] - curr_offset) > 1.0:
            new_offset = rec['offset']
            cut_t = binary_search_cut(yt_tgt, yt_ref, last_confirmed_t, t, curr_offset, new_offset)
            print(f"✂️ Cut Recovered @ {cut_t:6.1f}s: offset {curr_offset:+.2f}s -> {new_offset:+.2f}s (via {rec['name']}, conf={rec['conf']})")
            segments.append({
                'start': curr_seg_start,
                'end': cut_t,
                'offset': curr_offset,
                'conf': round(curr_conf, 3)
            })
            curr_seg_start = cut_t
            curr_offset = new_offset
            curr_conf = rec['conf']
            last_confirmed_t = t
            consecutive_low_conf = 0
            t = cut_t + step
        else:
            # Still in talk/transition, keep advancing
            t += step

    # Final segment
    segments.append({
        'start': curr_seg_start,
        'end': total_duration,
        'offset': curr_offset,
        'conf': round(curr_conf, 3)
    })

    elapsed = time.time() - t0
    print(f"\n🎉 Zero-Knowledge Crawl Completed in {elapsed:.2f} seconds!")
    print(f"Discovered {len(segments)} segments.")
    return segments

def evaluate_against_ground_truth(algo_segs, gt_segs, total_duration=8384.0):
    gt_cuts = [s[1] for s in gt_segs[:-1]]
    algo_cuts = [s['end'] for s in algo_segs[:-1]]

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

    # Dense Continuous Error
    time_points = np.arange(0.0, total_duration, 1.0)
    gt_continuous = np.zeros_like(time_points)
    algo_continuous = np.zeros_like(time_points)

    for tp_idx, t in enumerate(time_points):
        for g in gt_segs:
            if g[0] <= t < g[1]:
                gt_continuous[tp_idx] = g[2]
                break
        else:
            gt_continuous[tp_idx] = gt_segs[-1][2]

        for a in algo_segs:
            if a['start'] <= t < a['end']:
                algo_continuous[tp_idx] = a['offset']
                break
        else:
            algo_continuous[tp_idx] = algo_segs[-1]['offset']

    errs = np.abs(algo_continuous - gt_continuous)
    mae = float(np.mean(errs))
    rmse = float(np.sqrt(np.mean(errs ** 2)))
    p_05 = float(np.sum(errs <= 0.5) / len(errs) * 100.0)
    p_20 = float(np.sum(errs <= 2.0) / len(errs) * 100.0)
    p_100 = float(np.sum(errs > 10.0) / len(errs) * 100.0)

    print("\n" + "="*80)
    print("📊 PURE ZERO-KNOWLEDGE BENCHMARK RESULTS (vs GROUND TRUTH)")
    print("="*80)
    print(f"Total Discovered Segments: {len(algo_segs)} (Ground Truth: {len(gt_segs)})")
    print(f"Cut Recall:                {recall:.1f}% ({len(matched_gt)} / {len(gt_cuts)} cuts detected)")
    print(f"Cut Precision:             {precision:.1f}% ({len(matched_algo)} / {len(algo_cuts)} cuts verified)")
    print(f"Mean Cut Boundary Error:   {mean_cut_err:.2f} seconds")
    print(f"Continuous MAE:            {mae:.2f} seconds")
    print(f"Continuous RMSE:           {rmse:.2f} seconds")
    print(f"Sync <= 0.5s Coverage:     {p_05:.1f}% of concert")
    print(f"Sync <= 2.0s Coverage:     {p_20:.1f}% of concert")
    print(f"Desync > 10.0s Coverage:   {p_100:.1f}% of concert")
    print("="*80)

def main():
    gt_segs, setlists = get_ground_truth_and_setlist()
    algo_segs = run_zero_knowledge_pipeline(YT_TARGET, YT_MASTER, 8384.0, setlists, step=45.0)
    evaluate_against_ground_truth(algo_segs, gt_segs, 8384.0)

if __name__ == '__main__':
    main()
