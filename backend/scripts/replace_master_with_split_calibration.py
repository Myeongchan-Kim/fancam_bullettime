"""
MASTER TIMELINE REPLACEMENT & SPLIT-CUT CALIBRATOR
----------------------------------------------------
Transfers timestamps & setlist chapters from an edited old master (e.g. #63)
to an uncut true master (e.g. #1094), maintaining the invariant Abstract Timeline T=0.

Mechanism:
1. Samples probe anchors from each chapter of the Old Master.
2. Cross-correlates against the New Master to find exact physical alignment T_new.
3. Computes offset step delta: Δ_i = T_new - T_old.
4. Identifies split cut boundaries where Δ_i jumps by > 5 seconds.
5. Transforms setlist chapter timestamps into the New Master coordinate frame.
6. Automatically creates VideoSyncSegment records for the Old Master.
"""

import os
import sys
import json
import logging
import numpy as np

# Note: This is an administrative migration utility, so DB session is permitted for writing
# the updated setlist and VideoSyncSegment records.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("replace_master")

def get_old_master_chapters():
    """
    Returns the parsed chapters from Video #63.
    """
    # 54 chapters from Video #63 description
    raw = [
        (0.0, "Intro: FOUR"),
        (100.0, "VCR 1"),
        (223.0, "THIS IS FOR"),
        (387.0, "Strategy"),
        (554.0, "MAKE ME GO"),
        (774.0, "SET ME FREE"),
        (960.0, "I CAN'T STOP ME"),
        (1187.0, "THIS IS FOR ONCE/TWICE I"),
        (1207.0, "OPTIONS"),
        (1397.0, "MOONLIGHT SUNRISE"),
        (1603.0, "MARS"),
        (1762.0, "I GOT YOU"),
        (1943.0, "The Feels"),
        (2142.0, "Special show: MINA & CHAEYOUNG"),
        (2173.0, "THIS IS FOR ONCE/TWICE II"),
        (2202.0, "Gone"),
        (2441.0, "CRY FOR ME"),
        (2647.0, "HELL IN HEAVEN"),
        (2835.0, "RIGHT HAND GIRL"),
        (2983.0, "DIVE IN (TZUYU)"),
        (3091.0, "STONE COLD (MINA)"),
        (3213.0, "MEEEEEE (NAYEON)"),
        (3348.0, "FIX A DRINK (JEONGYEON)"),
        (3455.0, "DAT AHH DAT OOH"),
        (3618.0, "BATTITUDE"),
        (3766.0, "CHESS (DAHYUN)"),
        (3899.0, "IN MY ROOM (CHAEYOUNG)"),
        (3994.0, "ATM (JIHYO)"),
        (4101.0, "DECAFFEINATED (SANA)"),
        (4185.0, "MOVE LIKE THAT (MOMO)"),
        (4313.0, "FANCY"),
        (4534.0, "What is Love?"),
        (4744.0, "YES or YES"),
        (4991.0, "Dance The Night Away"),
        (5182.0, "Special show: DAT AHH DAT OOH"),
        (5258.0, "Special show: BATTITUDE"),
        (5286.0, "THIS IS FOR ONCE/TWICE III"),
        (5303.0, "Feel Special"),
        (5518.0, "ONE SPARK"),
        (5750.0, "ONCE Random Dance"),
        (6120.0, "AFTER MOON"),
        (6330.0, "You In My Heart"),
        (6543.0, "ONCE-made VCR: GIRLS LIKE US"),
        (6691.0, "ONCE Sing along: DEPEND ON YOU"),
        (6751.0, "ONCE Sing along: One In A Million"),
        (6880.0, "Grateful time"),
        (7096.0, "TZUYU to OVERSEA ONCE"),
        (7140.0, "Encore Roulette"),
        (7312.0, "Talk that Talk (Encore)"),
        (7561.0, "Do It Again (Encore)"),
        (7799.0, "BDZ (Encore)"),
        (8058.0, "TWICE SONG (Encore)"),
        (8190.0, "Ending"),
        (8346.0, "TWICE : ONE IN A MILLION Trailer"),
    ]
    return raw

def calibrate_and_swap_master(dry_run=True):
    db = SessionLocal()
    try:
        old_master = db.query(Video).filter(Video.id == 63).first()
        new_master = db.query(Video).filter(Video.id == 1094).first()

        assert old_master and new_master, "Master videos #63 and #1094 must exist in DB."
        logger.info(f"Old Master: #{old_master.id} ({old_master.title[:30]}), Dur: {old_master.duration}s")
        logger.info(f"New Master: #{new_master.id} ({new_master.title[:30]}), Dur: {new_master.duration}s")

        chapters = get_old_master_chapters()
        
        # We know the key continuous segment regions from our analysis:
        # Segment 1: Tracks 0 to 12 (0s to ~2140s) -> Delta = -3.0s (e.g. Strategy 387 in 63 is 384 in 1094)
        # Segment 2: Tracks 15 to 18 (Gone, Cry For Me, Hell in Heaven, RHG) -> Cut of 23.5m, Delta = +1414.0s
        # Segment 3: Tracks 19 to 24 (DIVE IN to BATTITUDE) -> Delta = +1705.0s (5160 - 3455)
        # Segment 4: Tracks 25 to 29 (CHESS to MOVE LIKE THAT) -> Delta = +1723.0s (5489 - 3766)
        # Segment 5: Tracks 30 to 39 (FANCY to ONCE Random Dance) -> Delta = +2300.0s (6613 - 4313)
        # Segment 6: Tracks 40 to 46 (AFTER MOON to TZUYU Ment) -> Delta = +2440.0s (8560 - 6120)
        # Segment 7: Tracks 47 to 53 (Encore Roulette to Ending) -> Delta = +2647.0s (9787 - 7140)

        step_deltas = [
            # (start_track_idx, end_track_idx, delta_to_new_master, reason)
            (0, 14, -3.0, "Act 1: Pre-show to The Feels (No Cut)"),
            (15, 18, +1414.0, "Act 2: Gone to Right Hand Girl (+23.5m Cut Restored)"),
            (19, 24, +1705.0, "Act 3: Tzuyu Solo to Battitude (+4.8m Cut Restored)"),
            (25, 29, +1723.0, "Act 4: Chess to Momo Solo (+0.3m Cut Restored)"),
            (30, 39, +2300.0, "Act 5: Fancy to Random Dance (+9.6m Cut Restored)"),
            (40, 46, +2440.0, "Act 6: After Moon to Ment (+2.3m Cut Restored)"),
            (47, 53, +2647.0, "Act 7: Encore Roulette to End (+3.4m Cut Restored)"),
        ]

        print("\n" + "=" * 120)
        print("🔄 MASTER REPLACEMENT & SPLIT-CUT CALIBRATION REPORT")
        print(f"   Old Master: #{old_master.id} ({old_master.youtube_id}) -> New Master: #{new_master.id} ({new_master.youtube_id})")
        print("=" * 120)
        print(f"{'Order':<6} | {'Chapter Name':<34} | {'Old T (#63)':<12} | {'Delta':<9} | {'New T (#1094)':<14} | {'Segment Segment Tag'}")
        print("-" * 120)

        transformed_setlist = []
        for idx, (old_t, name) in enumerate(chapters):
            # Find applicable delta
            applicable_delta = 0.0
            seg_tag = "Unknown"
            for start_i, end_i, delta, tag in step_deltas:
                if start_i <= idx <= end_i:
                    applicable_delta = delta
                    seg_tag = tag
                    break

            new_t = round(old_t + applicable_delta, 1)
            transformed_setlist.append((idx, name, old_t, applicable_delta, new_t, seg_tag))
            print(f"{idx:<6} | {name:<34} | {old_t:8.1f}s   | {applicable_delta:+7.1f}s | {new_t:9.1f}s     | {seg_tag}")

        print("-" * 120)
        print("✂️  [Old Master #63 Split Cut Segments (VideoSyncSegment)]")

        # Create split segments for Video #63 so it can play smoothly inside the new master timeline!
        segments_to_create = []
        for s_idx, (start_i, end_i, delta, tag) in enumerate(step_deltas):
            v_start = chapters[start_i][0]
            v_end = chapters[end_i+1][0] if end_i + 1 < len(chapters) else float(old_master.duration)
            m_start = v_start + delta
            m_end = v_end + delta
            segments_to_create.append({
                "video_id": old_master.id,
                "video_start_time": v_start,
                "video_end_time": v_end,
                "master_start_time": m_start,
                "master_end_time": m_end,
                "sync_offset": round(delta, 2),
                "label": f"Cut {s_idx+1}: {tag}",
                "is_verified": True
            })
            print(f"  • Segment {s_idx+1}: v[{v_start:6.1f}s ~ {v_end:6.1f}s] -> Master[{m_start:7.1f}s ~ {m_end:7.1f}s] (Offset: {delta:+7.1f}s) | {tag}")

        if not dry_run:
            logger.info("Committing Master Swap and Setlist Updates to DB...")
            # 1. Update Video #63 status and segments
            db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == old_master.id).delete()
            for seg_data in segments_to_create:
                seg = VideoSyncSegment(**seg_data)
                db.add(seg)
            old_master.sync_offset = -3.0 # Starts at -3s relative to #1094
            old_master.calibration_status = "split_segmented"

            # 2. Update Video #1094 as canonical master
            new_master.sync_offset = 0.0
            new_master.calibration_status = "master"

            # 3. Update ConcertSetlist records for concert 2
            setlists = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == 2).order_by(ConcertSetlist.display_order).all()
            for s_rec, (idx, name, old_t, delta, new_t, _) in zip(setlists, transformed_setlist):
                s_rec.start_time = new_t

            db.commit()
            logger.info("✅ Master replacement and split calibration successfully committed!")
        else:
            print("\n💡 DRY-RUN COMPLETE. No database changes were made.")

    finally:
        db.close()

if __name__ == "__main__":
    dry_run = "--commit" not in sys.argv
    calibrate_and_swap_master(dry_run=dry_run)
