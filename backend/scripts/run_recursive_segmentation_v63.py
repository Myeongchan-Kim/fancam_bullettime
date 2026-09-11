"""
Recursive 3-Point Calibration Runner for Video #63 (Day 2 Incheon)
Finds and resolves all internal edit cuts against Master Full Concert Video #1094.
"""

import sys
import os
import logging
import numpy as np
from typing import List, Dict, Any, Optional

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recursive_v63")

import json

PROBE_DUR = 10.0
SEARCH_WINDOW = 60.0
DRIFT_THRESHOLD = 1.5
MIN_SEG_DUR = 50.0
MAX_DEPTH = 3
PROGRESS_FILE = "scratch/recursive_v63_progress.json"

def probe_point(yt_target: str, yt_master: str, t_tgt: float, est_off: float, label: str = "") -> Dict[str, Any]:
    est_m = max(0.0, t_tgt + est_off)
    m_start = max(0.0, est_m - SEARCH_WINDOW / 2.0)

    tgt_name = f"rec_{yt_target}_{int(t_tgt)}_{int(PROBE_DUR)}"
    m_name = f"rec_{yt_master}_{int(m_start)}_{int(SEARCH_WINDOW)}"

    tgt_wav = download_audio_slice(yt_target, t_tgt, PROBE_DUR, tgt_name)
    m_wav = download_audio_slice(yt_master, m_start, SEARCH_WINDOW, m_name)

    m_sec, conf = cross_correlate(tgt_wav, m_wav, m_start)
    if conf < 0.11 or m_sec < 0:
        return {"success": False, "offset": est_off, "confidence": conf, "tgt": t_tgt}

    off = m_sec - t_tgt
    # Discard wild spurious correlation jumps (>25s) from search window edge
    if abs(off - est_off) > 25.0:
        return {"success": False, "offset": est_off, "confidence": conf, "tgt": t_tgt}

    return {
        "success": True,
        "offset": round(off, 2),
        "confidence": round(conf, 3),
        "master_time": round(m_sec, 2),
        "tgt": t_tgt
    }

def recursive_split_range(
    yt_target: str,
    yt_master: str,
    t_start: float,
    t_end: float,
    prior_offset: float,
    depth: int = 0
) -> List[Dict[str, Any]]:
    dur = t_end - t_start
    margin = min(8.0, dur * 0.1)
    p_start = t_start + margin
    p_end = max(p_start + 4.0, t_end - margin)
    p_mid = (t_start + t_end) / 2.0

    prefix = "  " * depth
    logger.info(f"{prefix}🔍 [Depth {depth}] Testing [{t_start:.1f}s ~ {t_end:.1f}s] (dur: {dur:.1f}s, prior: {prior_offset:+.2f}s)...")

    # Base case: too short or reached max depth
    if dur < MIN_SEG_DUR or depth >= MAX_DEPTH:
        mid_res = probe_point(yt_target, yt_master, p_mid, prior_offset, f"d{depth}_mid")
        final_off = mid_res["offset"] if mid_res["success"] else prior_offset
        return [{
            "start": t_start,
            "end": t_end,
            "offset": round(final_off, 2),
            "conf": mid_res.get("confidence", 0.0),
            "depth": depth
        }]

    # 3-Point Probe
    r_start = probe_point(yt_target, yt_master, p_start, prior_offset, f"d{depth}_start")
    r_mid = probe_point(yt_target, yt_master, p_mid, prior_offset, f"d{depth}_mid")
    r_end = probe_point(yt_target, yt_master, p_end, prior_offset, f"d{depth}_end")

    valid_res = [r for r in [r_start, r_mid, r_end] if r["success"]]
    offsets = [r["offset"] for r in valid_res]

    if len(offsets) < 2:
        logger.warning(f"{prefix}⚠️ Insufficient probe signal in [{t_start:.1f}s ~ {t_end:.1f}s], retaining prior {prior_offset:+.2f}s")
        return [{
            "start": t_start,
            "end": t_end,
            "offset": round(prior_offset, 2),
            "conf": 0.0,
            "depth": depth
        }]

    max_drift = max(offsets) - min(offsets)
    logger.info(f"{prefix}📊 Drift = {max_drift:.2f}s (offsets: {offsets})")

    if max_drift <= DRIFT_THRESHOLD:
        avg_off = float(np.mean(offsets))
        avg_conf = float(np.mean([r["confidence"] for r in valid_res]))
        logger.info(f"{prefix}✅ Flat section locked: [{t_start:.1f}s ~ {t_end:.1f}s] -> offset={avg_off:+.2f}s (conf={avg_conf:.3f})")
        return [{
            "start": t_start,
            "end": t_end,
            "offset": round(avg_off, 2),
            "conf": round(avg_conf, 3),
            "depth": depth
        }]

    # Cut detected -> Split at midpoint
    logger.info(f"{prefix}✂️ Cut detected (drift {max_drift:.2f}s > {DRIFT_THRESHOLD}s)! Bisecting at {p_mid:.1f}s...")
    left_prior = r_start["offset"] if r_start["success"] else prior_offset
    right_prior = r_end["offset"] if r_end["success"] else prior_offset

    left = recursive_split_range(yt_target, yt_master, t_start, p_mid, left_prior, depth + 1)
    right = recursive_split_range(yt_target, yt_master, p_mid, t_end, right_prior, depth + 1)

    return left + right


def run_recursive_calibration():
    session = SessionLocal()
    try:
        v63 = session.query(Video).filter(Video.id == 63).first()
        if not v63:
            logger.error("Video #63 not found!")
            return

        master = session.query(Video).filter(Video.id == 1094).first()
        if not master:
            logger.error("Master Video #1094 not found!")
            return

        setlists = session.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == v63.concert_id
        ).order_by(ConcertSetlist.start_time).all()

        def match_setlist(m_start: float) -> tuple[Optional[int], Optional[str]]:
            best = None
            min_dist = float("inf")
            for s in setlists:
                if s.start_time is not None:
                    dist = abs(s.start_time - m_start)
                    if dist < min_dist:
                        min_dist = dist
                        best = s
            if best and min_dist <= 200.0:
                name = best.song.name if best.song else best.event_name
                return best.id, name
            return None, None

        existing_segs = session.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == 63
        ).order_by(VideoSyncSegment.video_start_time).all()

        logger.info(f"Loaded {len(existing_segs)} initial coarse cuts for Video #63.")
        checkpoint = {}
        if os.path.exists(PROGRESS_FILE):
            try:
                with open(PROGRESS_FILE, "r") as pf:
                    checkpoint = json.load(pf)
                logger.info(f"Loaded existing checkpoint with {len(checkpoint)} completed cuts.")
            except Exception as e:
                logger.warning(f"Could not load checkpoint: {e}")

        all_refined = []

        for seg in existing_segs:
            seg_key = f"{int(seg.video_start_time)}_{int(seg.video_end_time)}"
            if seg_key in checkpoint:
                logger.info(f"\n{'='*80}\n⚡ [CHECKPOINT HIT] Coarse Cut [{seg.video_start_time:.1f}s ~ {seg.video_end_time:.1f}s] loaded ({len(checkpoint[seg_key])} segments).")
                all_refined.extend(checkpoint[seg_key])
                continue

            logger.info(f"\n{'='*80}\nProcessing Coarse Cut: [{seg.video_start_time:.1f}s ~ {seg.video_end_time:.1f}s] (prior: {seg.sync_offset:+.2f}s, label: {seg.label})")
            leafs = recursive_split_range(
                v63.youtube_id,
                master.youtube_id,
                seg.video_start_time,
                seg.video_end_time,
                seg.sync_offset
            )
            checkpoint[seg_key] = leafs
            with open(PROGRESS_FILE, "w") as pf:
                json.dump(checkpoint, pf, indent=2)
            all_refined.extend(leafs)

        # Merge adjacent segments if their offsets are virtually identical (diff <= 0.3s)
        merged = []
        for leaf in all_refined:
            if not merged:
                merged.append(leaf)
            else:
                last = merged[-1]
                if abs(leaf["offset"] - last["offset"]) <= 0.35 and abs(leaf["start"] - last["end"]) < 1.0:
                    # Merge
                    last["end"] = leaf["end"]
                    last["offset"] = round((last["offset"] + leaf["offset"]) / 2.0, 2)
                    last["conf"] = max(last["conf"], leaf["conf"])
                else:
                    merged.append(leaf)

        logger.info(f"\n{'='*100}\n🎯 FINAL HIGH-PRECISION SEGMENTATION RESULTS ({len(merged)} segments)\n{'='*100}")
        print(f"{'Idx':<4} | {'Video Range':<22} | {'Master Range':<22} | {'Offset':<10} | {'Label':<25}")
        print("-" * 95)

        # Replace in DB
        session.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 63).delete()
        
        for idx, seg_info in enumerate(merged):
            vs = seg_info["start"]
            ve = seg_info["end"]
            off = seg_info["offset"]
            ms = max(0.0, vs + off)
            me = max(0.0, ve + off)
            s_id, s_name = match_setlist(ms)
            lbl = s_name or f"Segment #{idx+1} ({int(vs)}s~{int(ve)}s)"

            new_db_seg = VideoSyncSegment(
                video_id=63,
                setlist_id=s_id,
                video_start_time=vs,
                video_end_time=ve,
                master_start_time=ms,
                master_end_time=me,
                sync_offset=off,
                label=lbl,
                is_verified=True
            )
            session.add(new_db_seg)
            print(f"{idx+1:<4} | {vs:7.1f}s ~ {ve:7.1f}s | {ms:7.1f}s ~ {me:7.1f}s | {off:+9.2f}s | {lbl:<25}")

        session.commit()
        logger.info("✅ All high-precision segments successfully persisted to DB!")

    finally:
        session.close()

if __name__ == "__main__":
    run_recursive_calibration()
