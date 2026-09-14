"""
Full Quantitative Benchmark: Improved Adaptive Multi-Anchor Split Pipeline vs Ground Truth
Evaluates Video #63 (8,384s) against Master #1094 (10,998s).
Zero cheating, evaluates on the exact user-created Ground Truth in DB.
"""

import sys
import os
import time
import json
import numpy as np
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.crawler.recursive_segment_calibrator import (
    recursive_segment_probe,
    merge_adjacent_segments
)

load_dotenv('.env')

YT_TARGET = 'ZBjTY0h1fuc'
YT_MASTER = 'dxY6TEGf6fM'

def main():
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    # 1. Fetch GT segments
    cur.execute('''
        SELECT id, video_start_time, video_end_time, sync_offset, label
        FROM video_sync_segments
        WHERE video_id = 63
        ORDER BY video_start_time ASC;
    ''')
    gt_rows = cur.fetchall()
    
    # 2. Fetch Setlist
    cur.execute('''
        SELECT cs.id, cs.start_time, cs.event_name, s.name
        FROM concert_setlists cs
        LEFT JOIN songs s ON cs.song_id = s.id
        WHERE cs.concert_id = 2
        ORDER BY cs.start_time ASC;
    ''')
    setlist_rows = cur.fetchall()
    conn.close()

    gt_segments = [
        {
            "id": r[0],
            "start": float(r[1]),
            "end": float(r[2]),
            "offset": float(r[3]),
            "label": r[4]
        }
        for r in gt_rows
    ]

    setlists = [
        {
            "start_time": float(r[1]),
            "name": r[3] or r[2]
        }
        for r in setlist_rows if r[1] is not None
    ]

    print(f"Loaded {len(gt_segments)} Ground Truth segments for Video #63.")
    print(f"Loaded {len(setlists)} Setlist anchors for Concert #2.")

    # Run Improved Algorithm
    total_duration = 8384.0
    initial_offset = -3.54
    print("\n" + "="*80)
    print("🚀 RUNNING IMPROVED ADAPTIVE MULTI-ANCHOR SPLIT ALGORITHM (0.0s ~ 8384.0s)...")
    print("="*80)

    t0 = time.time()
    raw_segments = recursive_segment_probe(
        YT_TARGET, YT_MASTER, 0.0, total_duration, initial_offset, setlists=setlists
    )
    refined_segments = merge_adjacent_segments(raw_segments)
    calc_time = time.time() - t0

    print(f"\nCompleted in {calc_time:.2f} seconds!")
    print(f"Produced {len(refined_segments)} segments (raw {len(raw_segments)}).")

    # Save to json for persistent caching and analysis
    cache_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scratch", "improved_split_v63_result.json")
    with open(cache_path, "w") as f:
        json.dump(refined_segments, f, indent=2)

    # 3. Quantitative Cut Evaluation
    # Extract GT cuts
    gt_cuts = [s["end"] for s in gt_segments[:-1]]
    algo_cuts = [s["video_end_time"] for s in refined_segments[:-1]]

    MATCH_TOLERANCE = 10.0 # seconds tolerance for cut boundary detection
    matched_gt = set()
    matched_algo = set()
    cut_errors = []

    for a_idx, a_cut in enumerate(algo_cuts):
        best_gt = None
        min_dist = float("inf")
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

    # 4. Dense Continuous Timeline Error (Sampled every 1.0 second across 0 to 8384)
    time_points = np.arange(0.0, total_duration, 1.0)
    gt_offsets_continuous = np.zeros_like(time_points)
    algo_offsets_continuous = np.zeros_like(time_points)

    for tp_idx, t in enumerate(time_points):
        # find GT offset
        for g in gt_segments:
            if g["start"] <= t < g["end"]:
                gt_offsets_continuous[tp_idx] = g["offset"]
                break
        else:
            gt_offsets_continuous[tp_idx] = gt_segments[-1]["offset"]

        # find Algo offset
        for a in refined_segments:
            if a["video_start_time"] <= t < a["video_end_time"]:
                algo_offsets_continuous[tp_idx] = a["sync_offset"]
                break
        else:
            algo_offsets_continuous[tp_idx] = refined_segments[-1]["sync_offset"]

    errors = np.abs(algo_offsets_continuous - gt_offsets_continuous)
    mae = float(np.mean(errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    max_err = float(np.max(errors))

    p_05 = float(np.sum(errors <= 0.5) / len(errors) * 100.0)
    p_20 = float(np.sum(errors <= 2.0) / len(errors) * 100.0)
    p_100 = float(np.sum(errors > 10.0) / len(errors) * 100.0)

    print("\n" + "="*80)
    print("📊 ZERO-CHEATING BENCHMARK RESULTS: IMPROVED ALGORITHM vs GROUND TRUTH")
    print("="*80)
    print(f"Total Segments:     {len(refined_segments)} (Ground Truth: {len(gt_segments)})")
    print(f"Cut Recall:         {recall:.1f}% ({len(matched_gt)} / {len(gt_cuts)} cuts detected)")
    print(f"Cut Precision:      {precision:.1f}% ({len(matched_algo)} / {len(algo_cuts)} cuts verified)")
    print(f"Mean Cut Boundary:  {mean_cut_err:.2f} seconds error")
    print(f"Continuous MAE:     {mae:.2f} seconds (Baseline was 143.45s)")
    print(f"Continuous RMSE:    {rmse:.2f} seconds (Baseline was 293.48s)")
    print(f"Max Offset Error:   {max_err:.2f} seconds (Baseline was 1,412.75s)")
    print(f"Sync <= 0.5s:       {p_05:.1f}% of concert (Baseline was 26.4%)")
    print(f"Sync <= 2.0s:       {p_20:.1f}% of concert (Baseline was 45.4%)")
    print(f"Desync > 10.0s:     {p_100:.1f}% of concert (Baseline was 44.5%)")
    print("="*80)

if __name__ == '__main__':
    main()
