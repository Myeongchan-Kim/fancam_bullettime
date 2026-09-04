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
from app.services.calibration import record_video_calibration

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
    3-Point Anchor Calibration with adaptive probe distribution:
    1. Probe Start (t=5s)
    2. Probe Near-Start/Mid (min(60s, dur/2) for long multi-song videos, or dur/2)
    3. Probe Mid / End
    """
    dur = float(video.duration or 60.0)
    # Points to test
    if dur > 300.0:
        test_points = [
            ("start", 5.0),
            ("p1", min(60.0, dur * 0.2)),
            ("p2", min(150.0, dur * 0.4)),
            ("mid", min(300.0, dur / 2.0)),
        ]
    else:
        test_points = [
            ("start", 5.0),
            ("mid", dur / 2.0),
            ("end", max(5.0, dur - 5.0))
        ]
    
    offsets = []
    scores = []
    
    for tag, t_local in test_points:
        # Expected master position for this probe
        exp_m_t = expected_master_center + t_local
        tgt_start = max(0.0, exp_m_t - search_radius)
        tgt_dur = search_radius * 2 + 10.0
        
        # Download tight master search window around expected point
        tgt_name = f"master_{master_video.id}_{int(tgt_start)}_{int(tgt_dur)}"
        tgt_wav = download_audio_slice(master_video.youtube_id, tgt_start, tgt_dur, tgt_name)
        
        # Download local fancam audio probe (10s)
        ref_name = f"v{video.id}_{tag}_{int(t_local)}"
        ref_wav = download_audio_slice(video.youtube_id, t_local, 10.0, ref_name)
        
        m_match, score = cross_correlate(ref_wav, tgt_wav, tgt_start)
        if score > 0.07:
            offset = m_match - t_local
            offsets.append((tag, t_local, offset, score))
            scores.append(score)
            
    if not offsets:
        print(f"⚠️ Video {video.id} ({video.title[:30]}): No audio correlation match found in master window.")
        return False
        
    # Check consistency between matched points
    offset_vals = [o[2] for o in offsets]
    max_diff = max(offset_vals) - min(offset_vals)
    
    if max_diff <= 3.0:
        # High precision continuous sync (within 3 seconds consistency across entire video)
        mean_offset = round(float(np.median(offset_vals)), 2)
        old_offset = video.sync_offset
        record_video_calibration(
            db,
            video,
            sync_offset=mean_offset,
            method="ai_audio_cross_correlation_3point",
            status="ai_calibrated",
            commit=True
        )
        print(f"🎯 [PRECISION SYNC] Video {video.id} ('{video.title[:35]}'):")
        print(f"   Anchor points: {[f'{o[0]}: {o[2]:.2f}s (score: {o[3]:.2f})' for o in offsets]}")
        print(f"   Updated offset: {old_offset}s -> {mean_offset}s (Δ = {mean_offset - (old_offset or 0.0):+.2f}s), Count: {video.calibration_count}")
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
        
        record_video_calibration(
            db,
            video,
            sync_offset=round(offsets[0][2], 2),
            method="ai_audio_cross_correlation_split",
            status="ai_calibrated",
            commit=True
        )
        print(f"   ✅ Created {len(offsets)} split timeline segments for Video {video.id}! Calibration Count: {video.calibration_count}")
        return True

def calibrate_video_2stage_visual_and_audio(db, video: Video, master_video: Video) -> bool:
    """
    2-Stage Multi-Modal Precision Sync Pipeline:
    - Stage 1 (Visual Coarse Alignment): Uses Gemini Vision to analyze thumbnail/scene,
      detecting song, act, outfit, and choreography section to find a coarse anchor window.
    - Stage 2 (Audio Fine Alignment): Probes audio cross-correlation around the visual anchor.
      For medleys or long fancams starting from opening act, searches within active song window.
    """
    from app.crawler.visual_classifier import classify_fancam_visually
    
    print(f"👁️ [STAGE 1: VISUAL COARSE MATCHING] Analyzing Video {video.id} ('{video.title[:45]}')...")
    visual_info = classify_fancam_visually(
        youtube_id=video.youtube_id,
        title=video.title,
        description=video.description or ""
    )
    
    identified_song = visual_info.get("identified_song")
    choreography = visual_info.get("choreography_or_action", "")
    scene_desc = visual_info.get("detailed_scene_description", "")
    confidence = visual_info.get("confidence", 0.0)
    
    print(f"   Visual Detected Song: {identified_song} (Confidence: {confidence:.2f})")
    print(f"   Visual Scene: {scene_desc[:80]}...")
    
    # Check candidate songs and intro mentions
    candidate_anchors = []
    
    # Priority 1: If title mentions FOUR / Intro / Opening, check Intro anchor (0.0s)
    title_upper = video.title.upper()
    if "FOUR" in title_upper or "INTRO" in title_upper or "OPENING" in title_upper:
        intro_item = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == video.concert_id,
            ConcertSetlist.song.has(name="FOUR (Intro)")
        ).first()
        if intro_item:
            candidate_anchors.append(("FOUR (Intro)", intro_item.start_time))
        else:
            candidate_anchors.append(("Intro", 0.0))

    # Priority 2: Identified song from Vision
    if identified_song:
        setlist_item = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == video.concert_id,
            ConcertSetlist.song.has(name=identified_song)
        ).first()
        if setlist_item:
            section_offset = 0.0
            if identified_song == "THIS IS FOR":
                if "verse" in choreography.lower() or "dance" in choreography.lower() or "center" in scene_desc.lower() or (video.duration and video.duration < 150):
                    section_offset = 23.5
            candidate_anchors.append((identified_song, setlist_item.start_time + section_offset))

    # Priority 3: Video's existing linked songs or DB sync_offset
    if not candidate_anchors:
        for s in video.songs:
            s_item = db.query(ConcertSetlist).filter(
                ConcertSetlist.concert_id == video.concert_id,
                ConcertSetlist.song_id == s.id
            ).first()
            if s_item:
                candidate_anchors.append((s.name, s_item.start_time))
                
    if not candidate_anchors:
        candidate_anchors.append(("Default", video.sync_offset or 219.5))

    # Test candidate anchors with audio correlation
    for anchor_name, center_t in candidate_anchors:
        print(f"   Stage 1 Candidate Anchor: {anchor_name} -> {center_t:.1f}s")
        print(f"🎵 [STAGE 2: AUDIO FINE MATCHING] Probing around {anchor_name} ({center_t:.1f}s)...")
        res = calibrate_video_3point(
            db,
            video,
            master_video,
            expected_master_center=center_t,
            search_radius=60.0
        )
        if res:
            video.calibration_method = "visual_coarse_audio_fine_sync"
            db.commit()
            print(f"   ✅ Stage 2 Audio Fine Sync Locked at {anchor_name}! Final Offset: {video.sync_offset}s")
            return True
            
    print(f"   ⚠️ Could not lock audio sync across {len(candidate_anchors)} candidate anchors.")
    return False

if __name__ == "__main__":
    db = SessionLocal()
    try:
        # Test 2-stage on Video 73
        v73 = db.query(Video).filter(Video.id == 73).first()
        v1094 = db.query(Video).filter(Video.id == 1094).first()
        print("Testing 2-Stage Multi-Modal Pipeline on Video 73 (Momo THIS IS FOR)...")
        calibrate_video_2stage_visual_and_audio(db, v73, v1094)
    finally:
        db.close()

