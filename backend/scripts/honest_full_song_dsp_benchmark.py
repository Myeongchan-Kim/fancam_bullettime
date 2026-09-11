"""
HONEST ZERO-CHEATING FULL-SONG DSP BENCHMARK
--------------------------------------------------
RULES:
1. ZERO DB imports or queries (Zero-DB Policy Compliant).
2. NO hardcoded video IDs (no 'vid == ...').
3. NO hand-crafted custom anchor offsets designed from ground truth.
4. Uses ONLY official setlist track start times and durations from data/fair_benchmark_data.json.
5. Performs Song Full-Window Scan: slides across the candidate song's duration to discover where fancam starts.
6. Evaluates against hidden ground truth only at the very final print step.
"""

import os
import sys
import json
import logging
import re
import numpy as np

# Anti-cheating verification
for banned in ["app.db", "app.models", "sqlalchemy", "psycopg2", "sqlite3"]:
    assert banned not in sys.modules, f"Cheating detected! Banned module {banned} is loaded."

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("honest_benchmark")

def parse_candidate_songs(title, official_setlist):
    """
    Legitimate NLP title parser matching against the official setlist.
    Excludes the tour title 'THIS IS FOR' when specific track names exist.
    """
    t_full = title.upper()
    
    matched_tracks = []
    for track in official_setlist:
        raw_name = track["song_name"]
        s_norm = re.sub(r'\(.*?\)', '', raw_name).strip().upper()
        if len(s_norm) >= 4:
            if s_norm in t_full:
                matched_tracks.append(track)
                
    if len(matched_tracks) > 1:
        specific = [t for t in matched_tracks if t["song_name"] != "THIS IS FOR"]
        if specific:
            return specific
            
    if matched_tracks:
        return matched_tracks
        
    for track in official_setlist:
        if track["song_name"] == "THIS IS FOR":
            return [track]
    return [official_setlist[0]]

def run_honest_benchmark():
    fixture_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fair_benchmark_data.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    master = data["master"]
    setlist = data["official_setlist"]
    fancams = data["fancams"]

    logger.info(f"Loaded {len(fancams)} test fancams, {len(setlist)} official setlist tracks.")
    logger.info(f"Master Video: #{master['id']} ({master['youtube_id']})")

    print("\n" + "=" * 145)
    print("🛡️  HONEST ZERO-CHEATING FULL-SONG DSP BENCHMARK")
    print("   (No Hardcoded IDs, No Ground-Truth Injected Anchors, Autonomous Song Window Scan)")
    print("=" * 145)
    print(f"{'ID':<5} | {'Parsed Song Track':<24} | {'Track Start':<11} | {'Best Master T':<13} | {'Pred Offset':<11} | {'Ground Truth':<12} | {'Delta':<10} | {'Score':<6} | {'Status'}")
    print("-" * 145)

    results = []

    for v in fancams:
        vid = v["id"]
        title = v["title"]
        dur = float(v["duration"] or 60.0)
        true_offset = v["ground_truth_offset"]

        candidate_tracks = parse_candidate_songs(title, setlist)
        
        # Probe start (t=15s or 15% duration, 10s slice)
        p_time = min(15.0, max(5.0, dur * 0.15))
        f_slice_name = f"honest_fancam_{vid}_{int(p_time)}"
        f_wav = download_audio_slice(v["youtube_id"], p_time, 10.0, f_slice_name)

        best_score = -1.0
        best_master_t = 0.0
        best_pred_offset = 0.0
        best_track_name = ""
        best_track_start = 0.0

        # Scan each candidate song across its duration
        for track in candidate_tracks:
            t_start = track["start_time"]
            t_name = track["song_name"]

            # Scan from (t_start - 10s) to (t_start + 240s) in 20s steps
            scan_origin = max(0.0, t_start - 10.0)
            step_size = 20.0
            window_size = 30.0
            max_scan = 240.0

            curr_offset = 0.0
            while curr_offset <= max_scan:
                scan_start = scan_origin + curr_offset
                m_slice_name = f"honest_m1094_{int(scan_start)}_{int(window_size)}"
                m_wav = download_audio_slice(master["youtube_id"], scan_start, window_size, m_slice_name)

                m_sec, score = cross_correlate(f_wav, m_wav, scan_start)
                if score > best_score:
                    best_score = score
                    best_master_t = m_sec
                    best_pred_offset = round(m_sec - p_time, 3)
                    best_track_name = t_name
                    best_track_start = t_start

                curr_offset += step_size

        real_delta = round(best_pred_offset - true_offset, 3)
        abs_delta = abs(real_delta)

        if abs_delta <= 1.0:
            status = "🎯 Sub-sec (<=1s)"
        elif abs_delta <= 10.0:
            status = "✅ Song Lock-on (<=10s)"
        elif abs_delta <= 60.0:
            status = "⚠️ Near Track (<=60s)"
        else:
            status = f"❌ Diverged ({real_delta:+.1f}s)"

        results.append((vid, best_track_name, best_track_start, best_master_t, best_pred_offset, true_offset, real_delta, best_score, status))
        print(f"{vid:<5} | {best_track_name:<24} | {best_track_start:9.1f}s  | {best_master_t:11.3f}s | {best_pred_offset:9.3f}s  | {true_offset:10.3f}s  | {real_delta:+8.3f}s | {best_score:.3f}  | {status}")

    print("-" * 145)
    valid_results = [r for r in results if r[7] > 0.03]
    deltas = [abs(r[6]) for r in valid_results]
    within_10s = sum(1 for d in deltas if d <= 10.0)

    print("📊 [HONEST BENCHMARK RESULT SUMMARY]")
    print(f"  • Total Validated Fancams: {len(results)}")
    print(f"  • Song Track Lock-on (Within 10s Error): {within_10s}/{len(results)} ({within_10s/len(results)*100:.1f}%)")
    print(f"  • Sub-second Alignment (Within 1.0s Error): {sum(1 for d in deltas if d <= 1.0)}/{len(results)} ({sum(1 for d in deltas if d <= 1.0)/len(results)*100:.1f}%)")
    print(f"  • Median Physical Delta: {np.median(deltas):.3f}s")
    print("=" * 145)

if __name__ == "__main__":
    run_honest_benchmark()
