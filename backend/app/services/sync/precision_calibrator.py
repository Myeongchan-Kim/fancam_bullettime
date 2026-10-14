"""
Precision Multi-Point Anchor & Split Timeline Calibrator Service.
Finds exact sub-second sync offsets using 3-Point Audio Waveform Cross-Correlation
and splits piecewise edited videos into VideoSyncSegments.
"""

import logging
import numpy as np

from app.models.models import Video, ConcertSetlist
from app.services.calibration import record_video_calibration
from app.services.audio_dsp import (
    download_audio_slice,
    cross_correlate,
    probe_acoustic_match,
    AUDIO_CACHE_DIR,
    YT_DLP_EXE,
)
from app.services.sync.segment_repository import replace_video_segments

logger = logging.getLogger(__name__)


def calibrate_video_3point(
    db,
    video: Video,
    master_video: Video,
    expected_master_center: float,
    search_radius: float = 400.0,
) -> bool:
    """
    3-Point Anchor Calibration with adaptive probe distribution.
    """
    dur = float(video.duration or 60.0)
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
            ("end", max(5.0, dur - 5.0)),
        ]

    offsets = []
    for tag, t_local in test_points:
        exp_m_t = expected_master_center + t_local
        tgt_start = max(0.0, exp_m_t - search_radius)
        tgt_dur = search_radius * 2 + 10.0

        tgt_name = f"master_{master_video.id}_{int(tgt_start)}_{int(tgt_dur)}"
        tgt_wav = download_audio_slice(master_video.youtube_id, tgt_start, tgt_dur, tgt_name)

        ref_name = f"v{video.id}_{tag}_{int(t_local)}"
        ref_wav = download_audio_slice(video.youtube_id, t_local, 10.0, ref_name)

        m_match, score = cross_correlate(ref_wav, tgt_wav, tgt_start)
        if score > 0.07:
            offset = m_match - t_local
            offsets.append((tag, t_local, offset, score))

    if not offsets:
        logger.warning("Video %s: No audio correlation match found in master window.", video.id)
        return False

    offset_vals = [o[2] for o in offsets]
    max_diff = max(offset_vals) - min(offset_vals)

    if max_diff <= 3.0:
        mean_offset = round(float(np.median(offset_vals)), 2)
        record_video_calibration(
            db,
            video,
            sync_offset=mean_offset,
            method="ai_audio_cross_correlation_3point",
            status="ai_calibrated",
            commit=True,
        )
        return True

    n_pts = len(offsets)
    segments_payload = []
    for i in range(n_pts):
        tag, t_local, off, sc = offsets[i]
        seg_start = 0.0 if i == 0 else round((offsets[i - 1][1] + t_local) / 2.0, 1)
        seg_end = dur if i == n_pts - 1 else round((t_local + offsets[i + 1][1]) / 2.0, 1)
        segments_payload.append(
            {
                "video_start_time": seg_start,
                "video_end_time": seg_end,
                "master_start_time": round(seg_start + off, 2),
                "master_end_time": round(seg_end + off, 2),
                "sync_offset": round(off, 2),
                "label": f"Part {i+1} ({tag})",
                "confidence": round(float(sc), 3),
                "is_verified": True,
            }
        )

    replace_video_segments(db, video.id, segments_payload)
    record_video_calibration(
        db,
        video,
        sync_offset=round(offsets[0][2], 2),
        method="ai_audio_cross_correlation_split",
        status="ai_calibrated",
        commit=True,
    )
    return True


def calibrate_video_peer_anchor(db, video: Video, song_name: str) -> bool:
    """
    P2P Peer Anchor Fast-Path.
    """
    peers = (
        db.query(Video)
        .filter(
            Video.concert_id == video.concert_id,
            Video.id != video.id,
            Video.duration != None,
            Video.duration < 600,
            Video.sync_offset != None,
            Video.calibration_status.in_(
                ["ai_calibrated", "manually_verified", "user_calibrated"]
            ),
            Video.songs.any(name=song_name),
        )
        .all()
    )

    if not peers:
        return False

    dur = float(video.duration or 60.0)
    probe_local_t = min(15.0, dur / 2.0)
    ref_name = f"v{video.id}_peer_probe_{int(probe_local_t)}"
    ref_wav = download_audio_slice(video.youtube_id, probe_local_t, 10.0, ref_name)

    for peer in peers:
        peer_dur = float(peer.duration or 100.0)
        tgt_dur = min(peer_dur, 120.0)
        tgt_name = f"peer_{peer.id}_slice_{int(tgt_dur)}"
        tgt_wav = download_audio_slice(peer.youtube_id, 0.0, tgt_dur, tgt_name)

        peer_matched_sec, score = cross_correlate(ref_wav, tgt_wav, 0.0)
        if score > 0.12:
            rel_offset = round(peer_matched_sec - probe_local_t, 2)
            derived_offset = round(peer.sync_offset + rel_offset, 2)
            record_video_calibration(
                db,
                video,
                sync_offset=derived_offset,
                method="p2p_peer_audio_fast_sync",
                status="ai_calibrated",
                parent_video_id=peer.id,
                relative_offset=rel_offset,
                commit=True,
            )
            return True

    return False


def try_fast_peer_sync(db, video: Video) -> bool:
    """
    Check if video already has tagged songs and try P2P peer correlation.
    """
    if video.songs:
        for s in video.songs:
            try:
                if calibrate_video_peer_anchor(db, video, s.name):
                    return True
            except Exception as e:
                logger.warning("Fast P2P attempt failed for %s: %s", s.name, e)
    return False


def calibrate_video_2stage_visual_and_audio(db, video: Video, master_video: Video) -> bool:
    """
    2-Stage Multi-Modal Precision Sync Pipeline.
    """
    from app.crawler.visual_classifier import classify_fancam_visually

    if try_fast_peer_sync(db, video):
        return True

    visual_info = classify_fancam_visually(
        youtube_id=video.youtube_id,
        title=video.title,
        description=video.description or "",
    )

    identified_song = visual_info.get("identified_song")

    if identified_song:
        try:
            if calibrate_video_peer_anchor(db, video, identified_song):
                return True
        except Exception as e:
            logger.warning("Peer anchor sync attempt failed: %s", e)

    candidate_anchors = []
    title_upper = (video.title or "").upper()
    if "FOUR" in title_upper or "INTRO" in title_upper or "OPENING" in title_upper:
        intro_item = (
            db.query(ConcertSetlist)
            .filter(
                ConcertSetlist.concert_id == video.concert_id,
                ConcertSetlist.song.has(name="FOUR (Intro)"),
            )
            .first()
        )
        candidate_anchors.append(("FOUR (Intro)", intro_item.start_time if intro_item else 0.0))

    if identified_song:
        setlist_item = (
            db.query(ConcertSetlist)
            .filter(
                ConcertSetlist.concert_id == video.concert_id,
                ConcertSetlist.song.has(name=identified_song),
            )
            .first()
        )
        if setlist_item and setlist_item.start_time is not None:
            candidate_anchors.append((identified_song, float(setlist_item.start_time)))

    if not candidate_anchors:
        for s in video.songs:
            s_item = (
                db.query(ConcertSetlist)
                .filter(
                    ConcertSetlist.concert_id == video.concert_id,
                    ConcertSetlist.song_id == s.id,
                )
                .first()
            )
            if s_item and s_item.start_time is not None:
                candidate_anchors.append((s.name, float(s_item.start_time)))

    if not candidate_anchors and video.sync_offset is not None:
        candidate_anchors.append(("ExistingOffset", float(video.sync_offset)))

    for anchor_name, center_t in candidate_anchors:
        res = calibrate_video_3point(
            db,
            video,
            master_video,
            expected_master_center=center_t,
            search_radius=60.0,
        )
        if res:
            video.calibration_method = "visual_coarse_audio_fine_sync"
            db.commit()
            return True

    return False
