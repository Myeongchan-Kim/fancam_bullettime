"""
Audio DSP Primitives & Slicing Service
---------------------------------------
Low-level acoustic processing layer:
- Fast local cache slice extraction via ffmpeg
- Remote yt-dlp section audio downloading with strict timeouts
- High-precision FFT Cross-Correlation with normalized correlation coefficient
- Bounded acoustic match probing
"""

import os
import sys
import glob
import shutil
import subprocess
import logging
from typing import Tuple, Dict, Any, Optional

import numpy as np
import scipy.signal
from scipy.io import wavfile

logger = logging.getLogger(__name__)

YT_DLP_EXE = (
    shutil.which("yt-dlp")
    or os.path.join(os.path.dirname(sys.executable), "yt-dlp")
    or "/opt/homebrew/bin/yt-dlp"
    or "yt-dlp"
)

AUDIO_CACHE_DIR = "scratch/precision_sync"
FULL_AUDIO_CACHE_DIRS = ["scratch/audio_cache"]


def ensure_cache_dir():
    os.makedirs(AUDIO_CACHE_DIR, exist_ok=True)


def download_audio_slice(yt_id: str, start_s: float, dur_s: float, out_name: str) -> str:
    """
    Retrieves a 16kHz mono WAV slice for a given YouTube ID and timestamp range.
    Uses local full audio cache if available (~0.05s), otherwise falls back to remote yt-dlp slice.
    """
    ensure_cache_dir()
    out_wav = os.path.join(AUDIO_CACHE_DIR, f"{out_name}.wav")
    if os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000:
        return out_wav

    # 1. Fast Path: Local full audio cache
    cached_candidates = [
        f"scratch/audio_cache/{yt_id}.opus",
        f"scratch/audio_cache/{yt_id}.webm",
        f"scratch/audio_cache/{yt_id}.m4a",
        f"scratch/audio_cache/{yt_id}.mp4",
        f"scratch/audio_cache/master_64_{yt_id}.opus",
        f"scratch/audio_cache/master_64_{yt_id}.webm",
        f"scratch/audio_cache/master_1094_{yt_id}.webm",
        f"scratch/audio_cache/v63_{yt_id}.webm",
    ]
    for c in cached_candidates:
        if os.path.exists(c) and os.path.getsize(c) > 10000:
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{max(0, start_s):.2f}",
                "-t", f"{dur_s:.2f}",
                "-i", c,
                "-ar", "16000", "-ac", "1",
                out_wav
            ]
            try:
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
                if os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000:
                    return out_wav
            except Exception:
                pass

    # 2. Remote Fallback: Stream slice via yt-dlp
    cmd = [
        YT_DLP_EXE,
        "--socket-timeout", "15",
        "--retries", "3",
        "--downloader-args", "ffmpeg_i:-timeout 15000000",
        "--download-sections", f"*{max(0, start_s):.1f}-{start_s+dur_s:.1f}",
        "-x", "--audio-format", "wav",
        "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
        "-o", os.path.join(AUDIO_CACHE_DIR, f"{out_name}.%(ext)s"),
        f"https://www.youtube.com/watch?v={yt_id}"
    ]
    for _ in range(2):
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
            if os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000:
                return out_wav
        except subprocess.TimeoutExpired:
            for p in glob.glob(os.path.join(AUDIO_CACHE_DIR, f"{out_name}*")):
                if not p.endswith(".wav"):
                    try:
                        os.remove(p)
                    except Exception:
                        pass
    return out_wav


def cross_correlate(ref_wav: str, tgt_wav: str, tgt_window_start: float) -> Tuple[float, float]:
    """
    Performs FFT cross-correlation between reference probe and target window.
    Returns: (best_matched_target_second, confidence_score)
    """
    if not os.path.exists(ref_wav) or not os.path.exists(tgt_wav):
        return -1.0, 0.0
    try:
        sr_ref, data_ref = wavfile.read(ref_wav)
        sr_tgt, data_tgt = wavfile.read(tgt_wav)
    except Exception as e:
        logger.warning(f"Error reading wav files for correlation: {e}")
        return -1.0, 0.0

    # Ensure 1D mono float32
    if data_ref.ndim > 1:
        data_ref = data_ref[:, 0]
    if data_tgt.ndim > 1:
        data_tgt = data_tgt[:, 0]

    data_ref = data_ref.astype(np.float32) / 32768.0
    data_tgt = data_tgt.astype(np.float32) / 32768.0

    if len(data_tgt) < len(data_ref):
        return -1.0, 0.0

    corr = scipy.signal.correlate(data_tgt, data_ref, mode="valid")
    best_lag = int(np.argmax(corr))
    matched_sec = tgt_window_start + (best_lag / sr_ref)

    norm_ref = np.linalg.norm(data_ref)
    norm_tgt = np.linalg.norm(data_tgt[best_lag : best_lag + len(data_ref)])
    score = float(corr[best_lag] / (norm_ref * norm_tgt + 1e-9))
    return float(matched_sec), score


def probe_acoustic_match(
    yt_tgt: str,
    yt_ref: str,
    t_tgt: float,
    est_ref_t: float,
    search_radius: float = 30.0,
    dur: float = 8.0,
    prefix: str = "dsp_probe"
) -> Dict[str, Any]:
    """
    Measures acoustic cross-correlation between target probe and reference search window.
    Returns: {
        'success': bool,
        'matched_ref_sec': float,
        'relative_offset': float (matched_ref_sec - t_tgt),
        'confidence': float
    }
    """
    ref_start = max(0.0, est_ref_t - search_radius)
    ref_dur = search_radius * 2.0 + dur

    tgt_name = f"{prefix}_tgt_{yt_tgt}_{int(t_tgt)}_{int(dur)}"
    ref_name = f"{prefix}_ref_{yt_ref}_{int(ref_start)}_{int(ref_dur)}"

    tgt_w = download_audio_slice(yt_tgt, t_tgt, dur, tgt_name)
    ref_w = download_audio_slice(yt_ref, ref_start, ref_dur, ref_name)

    m_sec, conf = cross_correlate(tgt_w, ref_w, ref_start)
    is_success = conf >= 0.12 and m_sec >= 0.0

    return {
        "success": is_success,
        "matched_ref_sec": round(m_sec, 2),
        "relative_offset": round(m_sec - t_tgt, 2) if is_success else None,
        "confidence": round(conf, 3)
    }
