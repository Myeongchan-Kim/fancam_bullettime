"""
Dry-run Benchmark Script for Manually Verified Videos in 0720 Incheon Concert.
Runs the AI Precision Audio Sync algorithm with the +-10s safety window
WITHOUT writing to the database, comparing:
[Manual Ground Truth] vs [AI Calculated Offset] vs [Delta (Error)]
"""

import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, Song, ConcertSetlist
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

def dry_run_manuals():
    db = SessionLocal()
    try:
        master = db.query(Video).filter(Video.id == 1094).first()
        if not master:
            print("❌ Master video #1094 not found!")
            return

        videos = db.query(Video).filter(Video.concert_id == 2).all()
        manuals = [
            v for v in videos 
            if v.calibration_status == 'manually_verified' or v.calibration_method == 'manual_studio' or v.id == 1714
        ]

        print(f"🔬 Starting Dry-run Benchmark for {len(manuals)} Manually Verified Videos...")
        print(f"Master Video: #{master.id} ({master.title[:30]})\n")
        print(f"{'ID':<5} | {'Song Name':<18} | {'Manual Truth':<12} | {'AI Calculated':<13} | {'Delta':<8} | {'Score':<6} | {'Status'}")
        print("-" * 80)

        results = []

        for v in manuals:
            s = db.query(Song).filter(Song.id == v.song_id).first()
            sname = s.name if s else 'Untagged'
            manual_offset = float(v.sync_offset or 0.0)
            
            # Determine probe point inside fancam
            dur = float(v.duration or 60.0)
            # Pick a clean mid-song point where singing/beat is active (e.g. 20s or dur/2)
            probe_t = min(25.0, max(5.0, dur / 2.0))

            # Expected master time based on manual truth
            exp_master_t = manual_offset + probe_t

            # 10s safety search window around expected point
            search_radius = 10.0
            tgt_start = max(0.0, exp_master_t - search_radius)
            tgt_dur = search_radius * 2.0 + 10.0 # 30s window in master

            try:
                # 1. Slice master audio
                tgt_name = f"dry_m1094_{int(tgt_start)}_{int(tgt_dur)}"
                tgt_wav = download_audio_slice(master.youtube_id, tgt_start, tgt_dur, tgt_name)

                # 2. Slice fancam audio probe (10s)
                ref_name = f"dry_v{v.id}_t{int(probe_t)}"
                ref_wav = download_audio_slice(v.youtube_id, probe_t, 10.0, ref_name)

                # 3. Cross correlate
                matched_sec, score = cross_correlate(ref_wav, tgt_wav, tgt_start)
                ai_offset = round(matched_sec - probe_t, 2)
                delta = round(ai_offset - manual_offset, 2)

                # Classification
                if abs(delta) <= 0.05:
                    status = "🎯 Perfect (<=0.05s)"
                elif abs(delta) <= 0.15:
                    status = "✅ Sub-frame (<=0.15s)"
                elif abs(delta) <= 1.0:
                    status = "⚠️ Close (<=1.0s)"
                else:
                    status = "❌ Diverged (>1.0s)"

                print(f"{v.id:<5} | {sname:<18} | {manual_offset:9.2f}s  | {ai_offset:10.2f}s  | {delta:+6.2f}s | {score:.2f}  | {status}")
                results.append((v.id, sname, manual_offset, ai_offset, delta, score, status))
            except Exception as e:
                print(f"{v.id:<5} | {sname:<18} | {manual_offset:9.2f}s  | {'ERROR':<13} | {'N/A':<8} | 0.00   | Error: {str(e)[:15]}")

        print("-" * 80)
        valid_deltas = [abs(r[4]) for r in results if r[5] > 0.05]
        if valid_deltas:
            print(f"📈 평균 편차: {np.mean(valid_deltas):.3f}s | 중앙값: {np.median(valid_deltas):.3f}s | 최대 편차: {np.max(valid_deltas):.3f}s")
            perfect_cnt = sum(1 for d in valid_deltas if d <= 0.05)
            subframe_cnt = sum(1 for d in valid_deltas if d <= 0.15)
            print(f"🎯 0.05초(50ms) 이내 일치율: {perfect_cnt}/{len(valid_deltas)} ({perfect_cnt/len(valid_deltas)*100:.1f}%)")
            print(f"✅ 0.15초(1프레임) 이내 일치율: {subframe_cnt}/{len(valid_deltas)} ({subframe_cnt/len(valid_deltas)*100:.1f}%)")

    finally:
        db.close()

if __name__ == "__main__":
    dry_run_manuals()
