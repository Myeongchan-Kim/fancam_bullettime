"""
Batch Precision 3-Point & Hierarchical Split Calibrator for Concerts.
Runs precision audio cross-correlation across all fancams for a concert,
auto-detecting cuts and writing high-precision VideoSyncSegments.
"""

import os
import sys
import time
import dotenv
import subprocess
import numpy as np
import scipy.signal
from scipy.io import wavfile

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Concert, Video, ConcertSetlist, VideoSyncSegment

os.makedirs("scratch/precision_sync", exist_ok=True)

def download_audio_slice(yt_id: str, start_s: float, dur_s: float, out_name: str) -> str:
    out_wav = f"scratch/precision_sync/{out_name}.wav"
    if os.path.exists(out_wav):
        return out_wav
    cmd = [
        "yt-dlp",
        "--download-sections", f"*{max(0, start_s):.1f}-{start_s+dur_s:.1f}",
        "-x", "--audio-format", "wav",
        "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
        "-o", f"scratch/precision_sync/{out_name}.%(ext)s",
        f"https://www.youtube.com/watch?v={yt_id}"
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_wav

def cross_correlate(ref_wav: str, tgt_wav: str, tgt_window_start: float) -> tuple[float, float]:
    if not os.path.exists(ref_wav) or not os.path.exists(tgt_wav):
        return -1.0, 0.0
    sr_ref, data_ref = wavfile.read(ref_wav)
    sr_tgt, data_tgt = wavfile.read(tgt_wav)
    
    data_ref = data_ref.astype(np.float32) / 32768.0
    data_tgt = data_tgt.astype(np.float32) / 32768.0
    
    if len(data_tgt) < len(data_ref):
        return -1.0, 0.0
        
    corr = scipy.signal.correlate(data_tgt, data_ref, mode="valid")
    best_lag = np.argmax(corr)
    matched_sec = tgt_window_start + (best_lag / sr_ref)
    
    norm_ref = np.linalg.norm(data_ref)
    norm_tgt = np.linalg.norm(data_tgt[best_lag : best_lag + len(data_ref)])
    score = corr[best_lag] / (norm_ref * norm_tgt + 1e-9)
    return float(matched_sec), float(score)

def calibrate_concert_fancams(concert_id: int, max_videos: int = 50):
    db = SessionLocal()
    try:
        concert = db.query(Concert).filter(Concert.id == concert_id).first()
        if not concert:
            print(f"❌ Concert {concert_id} not found.")
            return
            
        full_vids = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.is_unavailable == False,
            Video.duration >= 3600
        ).order_by(Video.duration.desc()).all()
        
        if not full_vids:
            print(f"⚠️ No master full video for Concert {concert_id}.")
            return
            
        master_vid = full_vids[0]
        print("=" * 100)
        print(f"🚀 Batch Precision 3-Point Calibration: Concert {concert_id} ({concert.city})")
        print(f"   Master Continuous Video: ID {master_vid.id} ({master_vid.duration/60:.1f}m)")
        print("=" * 100)
        
        fancams = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        
        print(f"Found {len(fancams)} individual fancams to calibrate.\n")
        
        calibrated = 0
        split_count = 0
        
        for idx, v in enumerate(fancams[:max_videos]):
            dur = float(v.duration or 60.0)
            expected_master_center = float(v.sync_offset or 0.0)
            if expected_master_center == 0.0:
                continue
                
            search_radius = 200.0
            tgt_start = max(0.0, expected_master_center - search_radius)
            tgt_dur = search_radius * 2 + dur
            
            tgt_name = f"m_{master_vid.id}_{int(tgt_start)}_{int(tgt_dur)}"
            tgt_wav = download_audio_slice(master_vid.youtube_id, tgt_start, tgt_dur, tgt_name)
            
            # 3-Point Sampling
            test_points = [
                ("start", 5.0),
                ("mid", dur / 2.0),
                ("end", max(5.0, dur - 5.0))
            ]
            
            offsets = []
            for tag, t_local in test_points:
                ref_name = f"v{v.id}_{tag}_{int(t_local)}"
                ref_wav = download_audio_slice(v.youtube_id, t_local, 10.0, ref_name)
                m_match, score = cross_correlate(ref_wav, tgt_wav, tgt_start)
                if score >= 0.08:
                    offsets.append((tag, t_local, m_match - t_local, score))
                    
            if not offsets:
                continue
                
            offset_vals = [o[2] for o in offsets]
            max_diff = max(offset_vals) - min(offset_vals)
            
            if max_diff <= 1.5:
                # Continuous video
                mean_offset = round(float(np.mean(offset_vals)), 2)
                old_offset = v.sync_offset
                v.sync_offset = mean_offset
                db.commit()
                calibrated += 1
                print(f"[{idx+1}/{len(fancams)}] ✅ [Continuous] Video {v.id:<4} | {v.title[:38]:<40} | Old: {old_offset:>6}s -> Exact: {mean_offset:>7.2f}s (Score: {offsets[0][3]:.2f})")
            else:
                # Split Timeline Segments
                db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == v.id).delete()
                for i, (tag, t_local, off, sc) in enumerate(offsets):
                    seg_start = 0.0 if i == 0 else (t_local - 10.0)
                    seg_end = dur if i == len(offsets) - 1 else (t_local + 10.0)
                    seg = VideoSyncSegment(
                        video_id=v.id,
                        video_start_time=seg_start,
                        video_end_time=seg_end,
                        master_start_time=seg_start + off,
                        master_end_time=seg_end + off,
                        sync_offset=round(off, 2),
                        label=f"Cut {i+1} ({tag})",
                        is_verified=True
                    )
                    db.add(seg)
                db.commit()
                split_count += 1
                print(f"[{idx+1}/{len(fancams)}] ✂️ [Split Cuts] Video {v.id:<4} | {v.title[:38]:<40} | Created {len(offsets)} Segments (Δ={max_diff:.1f}s)")
                
        print("\n" + "=" * 100)
        print(f"🎉 Batch Calibration Finished: {calibrated} Continuous Synced, {split_count} Split Segmented!")
        print("=" * 100)
        
    finally:
        db.close()

if __name__ == "__main__":
    calibrate_concert_fancams(concert_id=2, max_videos=15)
