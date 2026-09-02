import os
import sys
import time
import logging
import subprocess
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
import scipy.signal
import scipy.io.wavfile as wavfile
from sqlalchemy.orm import Session
import imageio_ffmpeg

from app.models.models import Video, Concert, ConcertSetlist, VideoSyncSegment

logger = logging.getLogger(__name__)

# Ensure ffmpeg path is available
try:
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"

def get_direct_audio_url(youtube_id: str) -> Optional[str]:
    """Extract direct audio streaming URL using yt-dlp."""
    try:
        url = f"https://www.youtube.com/watch?v={youtube_id}"
        cmd = ["yt-dlp", "-g", "-f", "ba", url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip().splitlines()[0]
        else:
            logger.warning(f"yt-dlp failed for {youtube_id}: {res.stderr}")
    except Exception as e:
        logger.warning(f"Failed to get audio URL for {youtube_id}: {e}")
    return None

def download_audio_slice(stream_url: str, start_sec: float, duration_sec: float, out_path: str) -> bool:
    """Download a slice of audio from stream URL and convert to 16kHz mono WAV."""
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        cmd = [
            FFMPEG_EXE, "-y",
            "-ss", str(max(0, start_sec)),
            "-t", str(duration_sec),
            "-i", stream_url,
            "-ar", "16000",
            "-ac", "1",
            out_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        return os.path.exists(out_path) and os.path.getsize(out_path) > 1000
    except Exception as e:
        logger.warning(f"Failed to slice audio at {start_sec}s ({duration_sec}s): {e}")
        return False

def correlate_audio_slices(ref_wav_path: str, tgt_wav_path: str, search_start_sec: float) -> Tuple[float, float]:
    """
    Perform cross-correlation between reference and target audio slices.
    Returns: (matched_target_sec, confidence_peak)
    """
    try:
        sr_ref, data_ref = wavfile.read(ref_wav_path)
        sr_tgt, data_tgt = wavfile.read(tgt_wav_path)
        
        data_ref = data_ref.astype(np.float32) / 32768.0
        data_tgt = data_tgt.astype(np.float32) / 32768.0
        
        if len(data_tgt) < len(data_ref):
            return search_start_sec, 0.0
            
        corr = scipy.signal.correlate(data_tgt, data_ref, mode="valid")
        best_lag_samples = np.argmax(corr)
        norm_ref = np.linalg.norm(data_ref)
        norm_tgt = np.linalg.norm(data_tgt[best_lag_samples:best_lag_samples + len(data_ref)])
        
        peak_val = float(corr[best_lag_samples] / (norm_ref * norm_tgt + 1e-9))
        best_offset_sec = float(best_lag_samples / sr_tgt)
        matched_target_sec = search_start_sec + best_offset_sec
        
        return matched_target_sec, peak_val
    except Exception as e:
        logger.warning(f"Correlation error: {e}")
        return search_start_sec, 0.0

def probe_video_boundaries_and_align(video_id: int, db: Session) -> Dict[str, Any]:
    """
    Core Boundary Probe Algorithm:
    1. Compares video start and end against reference full concert.
    2. Determines if uncut (constant offset) or edited (piecewise segments).
    3. Populates video_sync_segments in DB accordingly.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return {"success": False, "error": f"Video {video_id} not found"}
        
    if not video.concert_id:
        return {"success": False, "error": f"Video {video_id} has no concert assigned"}

    # Find reference full concert for this concert (e.g. Video 63 or video with highest segments)
    ref_video = db.query(Video).filter(
        Video.concert_id == video.concert_id,
        Video.duration > 3600
    ).first()
    
    # Fetch setlist landmarks
    setlist_items = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == video.concert_id
    ).order_by(ConcertSetlist.display_order).all()

    if not setlist_items or len(setlist_items) < 2:
        return {"success": False, "error": "Insufficient setlist items for alignment"}

    first_item = setlist_items[0]
    last_item = setlist_items[-1]

    ref_youtube_id = ref_video.youtube_id if ref_video else "ZBjTY0h1fuc"
    tgt_youtube_id = video.youtube_id

    scratch_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scratch", "auto_align", str(video.id))
    os.makedirs(scratch_dir, exist_ok=True)

    url_ref = get_direct_audio_url(ref_youtube_id)
    url_tgt = get_direct_audio_url(tgt_youtube_id)

    if not url_ref or not url_tgt:
        return {"success": False, "error": "Failed to extract streaming audio URLs"}

    logger.info(f"🔍 Probing boundaries for Video {video.id} ({video.title})...")

    # Probe 1: Start (First Song - 15s reference vs 120s search window)
    t_ref_start = float(first_item.start_time or 223.0)
    ref_start_wav = os.path.join(scratch_dir, "ref_start.wav")
    tgt_start_wav = os.path.join(scratch_dir, "tgt_start.wav")
    
    download_audio_slice(url_ref, t_ref_start, 15.0, ref_start_wav)
    search_start_time = max(0.0, t_ref_start - 60.0)
    download_audio_slice(url_tgt, search_start_time, 120.0, tgt_start_wav)
    
    t_tgt_start, conf_start = correlate_audio_slices(ref_start_wav, tgt_start_wav, search_start_time)
    delta_start = t_tgt_start - t_ref_start

    # Probe 2: End (Last Song / Finale - 15s reference vs 180s search window)
    t_ref_end = float(last_item.start_time or (ref_video.duration - 300.0 if ref_video else 8000.0))
    ref_end_wav = os.path.join(scratch_dir, "ref_end.wav")
    tgt_end_wav = os.path.join(scratch_dir, "tgt_end.wav")

    download_audio_slice(url_ref, t_ref_end, 15.0, ref_end_wav)
    est_tgt_end = max(0.0, min(float(video.duration) - 200.0, t_ref_end + delta_start))
    search_end_time = max(0.0, est_tgt_end - 90.0)
    download_audio_slice(url_tgt, search_end_time, 180.0, tgt_end_wav)

    t_tgt_end, conf_end = correlate_audio_slices(ref_end_wav, tgt_end_wav, search_end_time)
    delta_end = t_tgt_end - t_ref_end


    delta_drift = abs(delta_start - delta_end)
    is_uncut = delta_drift <= 4.0

    logger.info(f"📊 Probe Results for Video {video.id}:")
    logger.info(f"   Start Delta: {delta_start:+.2f}s (Conf: {conf_start:.3f})")
    logger.info(f"   End Delta:   {delta_end:+.2f}s (Conf: {conf_end:.3f})")
    logger.info(f"   Drift:       {delta_drift:.2f}s -> {'🟢 UNCUT (Uniform Offset)' if is_uncut else '🟡 EDITED (Multi-Segment)'}")

    # Clear existing segments
    db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == video.id).delete()

    created_segments = []
    if is_uncut:
        # Create continuous segments for all setlist items using uniform delta
        for i, item in enumerate(setlist_items):
            m_start = float(item.start_time or 0.0)
            m_end = float(setlist_items[i+1].start_time) if i+1 < len(setlist_items) and setlist_items[i+1].start_time else m_start + 240.0
            
            v_start = max(0.0, m_start + delta_start)
            v_end = min(float(video.duration), m_end + delta_start)
            
            if v_start < float(video.duration):
                seg = VideoSyncSegment(
                    video_id=video.id,
                    video_start_time=v_start,
                    video_end_time=v_end,
                    master_start_time=m_start,
                    master_end_time=m_end,
                    sync_offset=m_start - v_start,
                    label=item.event_name or (item.song.name if item.song else f"Act {i+1}"),
                    is_verified=True
                )
                db.add(seg)
                created_segments.append(seg)
        
        # Also update scalar sync_offset on video
        video.sync_offset = -delta_start
    else:
        # Stepwise / Act-level alignment for edited videos
        # Run parallel landmark probes on major Acts
        major_landmarks = setlist_items[::4] # Sample every 4th song
        if last_item not in major_landmarks:
            major_landmarks.append(last_item)

        act_deltas = []
        for lm in major_landmarks:
            m_time = float(lm.start_time or 0.0)
            r_wav = os.path.join(scratch_dir, f"ref_{int(m_time)}.wav")
            t_wav = os.path.join(scratch_dir, f"tgt_{int(m_time)}.wav")
            download_audio_slice(url_ref, m_time, 20.0, r_wav)
            download_audio_slice(url_tgt, max(0.0, m_time - 300.0), 600.0, t_wav)
            t_tgt, conf = correlate_audio_slices(r_wav, t_wav, max(0.0, m_time - 300.0))
            act_deltas.append((m_time, t_tgt - m_time, conf, lm))

        # Interpolate deltas to all setlist items
        for i, item in enumerate(setlist_items):
            m_start = float(item.start_time or 0.0)
            m_end = float(setlist_items[i+1].start_time) if i+1 < len(setlist_items) and setlist_items[i+1].start_time else m_start + 240.0
            
            # Find nearest act delta
            closest_delta = min(act_deltas, key=lambda d: abs(d[0] - m_start))[1]
            
            v_start = max(0.0, m_start + closest_delta)
            v_end = min(float(video.duration), m_end + closest_delta)
            
            if v_start < float(video.duration) and v_end > v_start:
                seg = VideoSyncSegment(
                    video_id=video.id,
                    video_start_time=v_start,
                    video_end_time=v_end,
                    master_start_time=m_start,
                    master_end_time=m_end,
                    sync_offset=m_start - v_start,
                    label=item.event_name or (item.song.name if item.song else f"Track {i+1}"),
                    is_verified=True
                )
                db.add(seg)
                created_segments.append(seg)

    db.commit()

    return {
        "success": True,
        "video_id": video.id,
        "is_uncut": is_uncut,
        "delta_start": delta_start,
        "delta_end": delta_end,
        "delta_drift": delta_drift,
        "segments_count": len(created_segments),
        "message": f"Successfully aligned {len(created_segments)} segments ({'Uncut Continuous' if is_uncut else 'Piecewise Edited'})."
    }
