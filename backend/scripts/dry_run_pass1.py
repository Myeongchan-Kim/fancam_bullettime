"""
Dry-Run Pass 1 (Macro Discovery) Script

Safe, Read-Only script that executes Pass 1 coarse landmark discovery
WITHOUT writing, updating, or deleting any records in the database.
"""

import sys
import os
import argparse
import logging
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from app.crawler.two_pass_calibrator import pass1_generate_coarse_frames

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("dry_run_pass1")


def dry_run_pass1_for_video(video_id: int, coarse_step: float = 90.0):
    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            print(f"❌ Video #{video_id} not found.")
            return

        concert_id = video.concert_id
        master = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.id != video.id,
            Video.is_unavailable == False,
            Video.duration > 3600
        ).order_by(Video.duration.desc()).first()

        if not master:
            print(f"❌ No master video found for concert #{concert_id}.")
            return

        total_dur = float(video.duration or 300.0)

        # Setlists
        setlists_rows = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == concert_id
        ).order_by(ConcertSetlist.start_time).all()

        setlists = [
            {
                "id": s.id,
                "start_time": s.start_time,
                "name": s.song.name if s.song else (s.event_name or "Unknown")
            }
            for s in setlists_rows
        ]

        # Existing segments for comparison
        existing_segs = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == video_id
        ).order_by(VideoSyncSegment.video_start_time).all()

        print("\n" + "=" * 80)
        print(f"🛡️  [DRY-RUN] Pass 1 Macro Landmark Discovery for Video #{video_id}")
        print(f"   Title: {video.title}")
        print(f"   Duration: {total_dur:.1f}s (~{total_dur / 60.0:.1f} min)")
        print(f"   Master: Video #{master.id} ({master.youtube_id})")
        print(f"   Existing DB Segments: {len(existing_segs)} (WILL NOT BE MODIFIED)")
        print("=" * 80 + "\n")

        # Run Pass 1 (Pure in-memory DSP)
        frames = pass1_generate_coarse_frames(
            yt_tgt=video.youtube_id,
            yt_ref=master.youtube_id,
            total_dur=total_dur,
            setlists=setlists,
            coarse_step=coarse_step
        )

        print("\n" + "-" * 80)
        print(f"📊 [Pass 1 Result] Discovered {len(frames)} Coarse Landmark Frames:")
        print(f"{'#':<3} | {'Video Range':<20} | {'Duration':<9} | {'Est. Offset':<12} | {'Master Range':<20}")
        print("-" * 80)

        for i, f in enumerate(frames):
            s = f["start"]
            e = f["end"]
            dur = e - s
            off = f["offset"]
            m_s = s + off
            m_e = e + off
            print(f"{i+1:<3} | {s:7.1f}s ~ {e:7.1f}s | {dur:6.1f}s   | {off:+8.2f}s    | {m_s:7.1f}s ~ {m_e:7.1f}s")

        print("-" * 80)

        if existing_segs:
            print("\n📋 [Comparison with Existing DB Segments]")
            print(f"{'DB Seg #':<8} | {'DB Video Range':<20} | {'DB Offset':<10} | {'Label':<25}")
            print("-" * 80)
            for s in existing_segs:
                print(f"{s.id:<8} | {s.video_start_time:7.1f}s ~ {s.video_end_time:7.1f}s | {s.sync_offset:+8.2f}s | {s.label or ''}")
            print("-" * 80)

        print("\n🔒 [DRY-RUN SAFEGUARD] 100% Read-Only mode executed.")
        print("   -> 0 database modifications made. All existing records are completely intact.\n")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dry-run Pass 1 for a video.")
    parser.add_argument("--video-id", type=int, default=63, help="Video ID to run Pass 1 on (default: 63)")
    parser.add_argument("--step", type=float, default=90.0, help="Coarse probe stride in seconds (default: 90.0)")
    args = parser.parse_args()

    dry_run_pass1_for_video(args.video_id, coarse_step=args.step)

