"""
Precision Multi-Point Anchor & Split Timeline Calibrator.
Finds exact sub-second sync offsets using 3-Point Audio Waveform Cross-Correlation
(Start, Mid, End) and automatically splits piecewise edited videos into VideoSyncSegments.
"""

import os
import sys
import dotenv
import subprocess
import numpy as np
import scipy.signal
from scipy.io import wavfile

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment

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
    """Returns (best_matched_master_second, confidence_score)."""
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

def calibrate_video_3point(db, video: Video, master_video: Video, expected_master_center: float, search_radius: float = 400.0):
    """
    3-Point Anchor Calibration:
    1. Probe Start (t=5s)
    2. Probe Mid (t=duration/2)
    3. Probe End (t=duration-5s)
    """
    dur = float(video.duration or 60.0)
    tgt_start = max(0.0, expected_master_center - search_radius)
    tgt_dur = search_radius * 2 + dur
    
    # Download master search window audio
    tgt_name = f"master_{master_video.id}_{int(tgt_start)}_{int(tgt_dur)}"
    tgt_wav = download_audio_slice(master_video.youtube_id, tgt_start, tgt_dur, tgt_name)
    
    # Points to test
    test_points = [
        ("start", 5.0),
        ("mid", dur / 2.0),
        ("end", max(5.0, dur - 5.0))
    ]
    
    offsets = []
    scores = []
    
    for tag, t_local in test_points:
        ref_name = f"v{video.id}_{tag}_{int(t_local)}"
        ref_wav = download_audio_slice(video.youtube_id, t_local, 10.0, ref_name)
        m_match, score = cross_correlate(ref_wav, tgt_wav, tgt_start)
        if score > 0.08:
            offset = m_match - t_local
            offsets.append((tag, t_local, offset, score))
            scores.append(score)
            
    if not offsets:
        print(f"⚠️ Video {video.id} ({video.title[:30]}): No audio correlation match found in master window.")
        return False
        
    # Check consistency between Start, Mid, End
    offset_vals = [o[2] for o in offsets]
    max_diff = max(offset_vals) - min(offset_vals)
    
    if max_diff <= 1.5:
        # High precision continuous sync (within 1 second!)
        mean_offset = round(float(np.mean(offset_vals)), 2)
        old_offset = video.sync_offset
        video.sync_offset = mean_offset
        db.commit()
        print(f"🎯 [PRECISION SYNC] Video {video.id} ('{video.title[:35]}'):")
        print(f"   Anchor points: {[f'{o[0]}: {o[2]:.2f}s (score: {o[3]:.2f})' for o in offsets]}")
        print(f"   Updated offset: {old_offset}s -> {mean_offset}s (Δ = {mean_offset - (old_offset or 0.0):+.2f}s)")
        return True
    else:
        # Drift / Cuts detected: Video needs Split Timeline Segments
        print(f"✂️ [SPLIT TIMELINE NEEDED] Video {video.id} has internal cuts (max diff: {max_diff:.1f}s):")
        for tag, t_local, off, sc in offsets:
            print(f"   {tag.upper()} (t={t_local:.1f}s) -> Master Offset = {off:.2f}s (Confidence: {sc:.2f})")
            
        # Create piecewise VideoSyncSegments for each point
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video.id).delete()
        for i, (tag, t_local, off, sc) in enumerate(offsets):
            seg_start = 0.0 if i == 0 else (t_local - 10.0)
            seg_end = dur if i == len(offsets) - 1 else (t_local + 10.0)
            seg = VideoSyncSegment(
                video_id=video.id,
                video_start_time=seg_start,
                video_end_time=seg_end,
                master_start_time=seg_start + off,
                master_end_time=seg_end + off,
                sync_offset=round(off, 2),
                label=f"Part {i+1} ({tag})",
                is_verified=True
            )
            db.add(seg)
        db.commit()
        print(f"   ✅ Created {len(offsets)} split timeline segments for Video {video.id}!")
        return True

if __name__ == "__main__":
    db = SessionLocal()
    try:
        # Test on Sana Video 1700
        v1700 = db.query(Video).filter(Video.id == 1700).first()
        v1094 = db.query(Video).filter(Video.id == 1094).first()
        print("Testing 3-Point Anchor Precision Calibrator on Video 1700 (Sana Decaffeinated)...")
        calibrate_video_3point(db, v1700, v1094, expected_master_center=5850.0, search_radius=300.0)
    finally:
        db.close()
