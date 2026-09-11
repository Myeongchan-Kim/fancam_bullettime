"""
AUTONOMOUS ZERO-HARDCODING MASTER SPLIT & SETLIST CALIBRATOR
--------------------------------------------------------------
Rigorous, fully autonomous algorithm for any concert:
1. Takes an edited Old Master (with chapter timestamps) and an uncut New Master.
2. Samples audio probes across each chapter of the Old Master.
3. Automatically locates matching timestamps in the New Master using adaptive DSP search.
4. Detects split cuts purely mathematically via 1D Change-Point Detection (|Δ| > threshold).
5. Segments the Old Master into VideoSyncSegment records and transforms Setlist chapters.
6. ZERO hardcoded chapter indices, ZERO hardcoded delta values.
"""

import os
import sys
import logging
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("autonomous_split_calibrator")

def parse_chapters_from_description(description_text):
    """
    Parses timestamps and chapter names directly from video description.
    Works for any YouTube video format.
    """
    import re
    def parse_sec(t_str):
        parts = list(map(int, t_str.split(':')))
        if len(parts) == 3: return parts[0]*3600 + parts[1]*60 + parts[2]
        return parts[0]*60 + parts[1]

    chapters = []
    for line in description_text.splitlines():
        m = re.match(r'^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$', line.strip())
        if m:
            t_sec = float(parse_sec(m.group(1)))
            name = m.group(2).strip()
            chapters.append((t_sec, name))
    return chapters

def detect_split_segments(measured_deltas, cut_threshold=5.0):
    """
    1D Change-Point Detection:
    Groups chapters into continuous segments whenever adjacent delta difference exceeds cut_threshold.
    Returns list of segments: [(start_idx, end_idx, median_delta), ...]
    """
    segments = []
    if not measured_deltas:
        return segments

    curr_start = 0
    curr_deltas = [measured_deltas[0]]

    for i in range(1, len(measured_deltas)):
        diff = abs(measured_deltas[i] - measured_deltas[i-1])
        if diff > cut_threshold:
            # Cut boundary detected!
            seg_delta = float(np.median(curr_deltas))
            segments.append((curr_start, i - 1, round(seg_delta, 2)))
            curr_start = i
            curr_deltas = [measured_deltas[i]]
        else:
            curr_deltas.append(measured_deltas[i])

    # Final segment
    seg_delta = float(np.median(curr_deltas))
    segments.append((curr_start, len(measured_deltas) - 1, round(seg_delta, 2)))
    return segments

def run_autonomous_calibration(old_master_id, new_master_id, concert_id, dry_run=True):
    db = SessionLocal()
    try:
        old_m = db.query(Video).filter(Video.id == old_master_id).first()
        new_m = db.query(Video).filter(Video.id == new_master_id).first()

        assert old_m and new_m, f"Videos {old_master_id} and {new_master_id} must exist in DB."
        logger.info(f"Old Master: #{old_m.id} ({old_m.youtube_id}) | New Master: #{new_m.id} ({new_m.youtube_id})")

        # 1. Parse raw chapters from old master's description
        import yt_dlp
        ydl_opts = {'extract_flat': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={old_m.youtube_id}", download=False)
            desc = info.get('description') or ''
        
        chapters = parse_chapters_from_description(desc)
        logger.info(f"Extracted {len(chapters)} raw chapters from Old Master #{old_m.id} description.")
        assert len(chapters) > 0, "No chapters found in old master description."

        # 2. Sequential DSP Probe & Monotonic Forward Tracking
        print("\n" + "=" * 130)
        print("🔍 AUTONOMOUS DSP LANDMARK PROBING ACROSS ALL CHAPTERS")
        print("=" * 130)
        print(f"{'Idx':<4} | {'Old T':<9} | {'Chapter Name':<34} | {'Best Match T':<13} | {'Delta (T_new - T_old)':<24} | {'Score'}")
        print("-" * 130)

        measured_deltas = []
        current_est_delta = 0.0

        for idx, (t_old, name) in enumerate(chapters):
            # Probe 10s audio from Old Master
            # Choose probe 10s after chapter start to avoid opening applause
            p_offset = min(15.0, 10.0)
            f_slice_name = f"auto_oldm_{old_m.id}_{int(t_old + p_offset)}"
            old_wav = download_audio_slice(old_m.youtube_id, t_old + p_offset, 10.0, f_slice_name)

            best_match_t = 0.0
            best_score = -1.0

            # Adaptive search: first try around t_old + current_est_delta
            window_size = 30.0
            search_centers = [t_old + current_est_delta]
            
            # If search_center doesn't yield high score, scan forward up to +3000s in 60s jumps
            found = False
            for sc in search_centers:
                scan_start = max(0.0, sc - 10.0)
                m_slice_name = f"auto_newm_{new_m.id}_{int(scan_start)}_{int(window_size)}"
                new_wav = download_audio_slice(new_m.youtube_id, scan_start, window_size, m_slice_name)
                m_sec, score = cross_correlate(old_wav, new_wav, scan_start)
                if score >= 0.08:
                    best_match_t = m_sec - p_offset
                    best_score = score
                    found = True
                    break

            if not found:
                # Forward re-acquisition scan
                # Step forward from last known new_master position
                last_m_pos = (measured_deltas[-1] + t_old) if measured_deltas else t_old
                for fwd_step in range(0, 3000, 45):
                    scan_start = max(0.0, last_m_pos + fwd_step)
                    if scan_start > float(new_m.duration or 99999):
                        break
                    m_slice_name = f"auto_newm_{new_m.id}_{int(scan_start)}_{int(window_size)}"
                    new_wav = download_audio_slice(new_m.youtube_id, scan_start, window_size, m_slice_name)
                    m_sec, score = cross_correlate(old_wav, new_wav, scan_start)
                    if score > best_score:
                        best_score = score
                        best_match_t = m_sec - p_offset
                    if score >= 0.08:
                        break

            delta = round(best_match_t - t_old, 2)
            measured_deltas.append(delta)
            if best_score >= 0.07:
                current_est_delta = delta

            print(f"{idx:<4} | {t_old:7.1f}s | {name:<34} | {best_match_t:9.1f}s   | {delta:+10.2f}s                | {best_score:.3f}")

        # 3. Autonomous 1D Change-Point Detection
        segments = detect_split_segments(measured_deltas, cut_threshold=10.0)

        print("\n" + "=" * 130)
        print("✂️  AUTONOMOUS SPLIT CUT SEGMENTS DETECTED (NO HARDCODING)")
        print("=" * 130)
        for s_idx, (s_start, s_end, seg_delta) in enumerate(segments):
            v_start = chapters[s_start][0]
            v_end = chapters[s_end + 1][0] if s_end + 1 < len(chapters) else float(old_m.duration)
            m_start = round(v_start + seg_delta, 1)
            m_end = round(v_end + seg_delta, 1)
            first_song = chapters[s_start][1]
            last_song = chapters[s_end][1]
            print(f"  • Segment {s_idx+1}: [{v_start:6.1f}s ~ {v_end:6.1f}s] -> Master [{m_start:7.1f}s ~ {m_end:7.1f}s] (Offset: {seg_delta:+8.2f}s) | '{first_song}' ~ '{last_song}'")

        print("=" * 130)

        if not dry_run:
            logger.info("Committing autonomously detected segments & setlist to DB...")
            # 1. Update VideoSyncSegment for Old Master
            db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == old_m.id).delete()
            for s_idx, (s_start, s_end, seg_delta) in enumerate(segments):
                v_start = chapters[s_start][0]
                v_end = chapters[s_end + 1][0] if s_end + 1 < len(chapters) else float(old_m.duration)
                seg = VideoSyncSegment(
                    video_id=old_m.id,
                    video_start_time=v_start,
                    video_end_time=v_end,
                    master_start_time=v_start + seg_delta,
                    master_end_time=v_end + seg_delta,
                    sync_offset=seg_delta,
                    label=f"Auto Segment {s_idx+1}: {chapters[s_start][1]}",
                    is_verified=True
                )
                db.add(seg)

            old_m.sync_offset = segments[0][2]
            old_m.calibration_status = "split_segmented"
            new_m.sync_offset = 0.0
            new_m.calibration_status = "master"

            # 2. Update ConcertSetlist records
            setlists = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).order_by(ConcertSetlist.display_order).all()
            for s_idx, (s_start, s_end, seg_delta) in enumerate(segments):
                for ch_idx in range(s_start, s_end + 1):
                    if ch_idx < len(setlists):
                        new_track_time = round(chapters[ch_idx][0] + seg_delta, 1)
                        setlists[ch_idx].start_time = new_track_time

            db.commit()
            logger.info("✅ Database successfully updated with autonomous calibration!")

    finally:
        db.close()

if __name__ == "__main__":
    dry_run = "--commit" not in sys.argv
    run_autonomous_calibration(old_master_id=63, new_master_id=1094, concert_id=2, dry_run=dry_run)
