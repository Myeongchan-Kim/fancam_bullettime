from .master_election import elect_master_video, get_candidate_master_videos
from .segment_repository import find_setlist_match, replace_video_segments

_LAZY_PRECISION_ATTRS = {
    "calibrate_video_3point",
    "calibrate_video_peer_anchor",
    "try_fast_peer_sync",
    "calibrate_video_2stage_visual_and_audio",
}

__all__ = [
    "elect_master_video",
    "get_candidate_master_videos",
    "find_setlist_match",
    "replace_video_segments",
    "calibrate_video_3point",
    "calibrate_video_peer_anchor",
    "try_fast_peer_sync",
    "calibrate_video_2stage_visual_and_audio",
]


def __getattr__(name: str):
    if name in _LAZY_PRECISION_ATTRS:
        from . import precision_calibrator
        return getattr(precision_calibrator, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

