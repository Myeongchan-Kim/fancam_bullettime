"""
Backward-compatible CLI & re-export shim for Precision Sync Calibrator.
Core implementation now lives in `app.services.sync.precision_calibrator`.
"""

import os
import sys

if __name__ == "__main__":
    import dotenv
    dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.services.audio_dsp import (
    download_audio_slice,
    cross_correlate,
    probe_acoustic_match,
    AUDIO_CACHE_DIR,
    YT_DLP_EXE,
)
from app.services.sync.precision_calibrator import (
    calibrate_video_3point,
    calibrate_video_peer_anchor,
    try_fast_peer_sync,
    calibrate_video_2stage_visual_and_audio,
)

__all__ = [
    "download_audio_slice",
    "cross_correlate",
    "probe_acoustic_match",
    "AUDIO_CACHE_DIR",
    "YT_DLP_EXE",
    "calibrate_video_3point",
    "calibrate_video_peer_anchor",
    "try_fast_peer_sync",
    "calibrate_video_2stage_visual_and_audio",
]
