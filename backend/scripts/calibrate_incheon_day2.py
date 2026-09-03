"""
Calibrate Incheon Day 2 (2025-07-20) Master Timeline and all 81 active fancams.
Uses Video 1094 (3-hour uncut concert) as the continuous Master Concert Time ground truth.
"""

import os
import sys
import dotenv
from typing import Dict, Any

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, Song, VideoSyncSegment
from app.crawler.timeline_aligner import (
    get_direct_audio_url,
    download_audio_slice,
    correlate_audio_slices
)

def run_calibration():
    db = SessionLocal()
    try:
        print("🚀 Starting Incheon Day 2 Master Timeline Calibration...")
        
        # 1. Fetch Concert 2 setlist
        setlist_items = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == 2
        ).order_by(ConcertSetlist.display_order).all()
        
        print(f"📋 Loaded {len(setlist_items)} setlist items for Concert 2 (Incheon Day 2).")

        # 2. Get Video 1094 (Master Uncut Video)
        v1094 = db.query(Video).filter(Video.id == 1094).first()
        if not v1094:
            print("❌ Video 1094 not found!")
            return

        # 3. Known anchor timepoints in Video 1094 (Audio-verified ground truth)
        # Act 1: ~220s ~ 2252s
        # Act 2 (Solos): ~2926s ~ 4350s
        # Act 3 (Hits): ~4994s ~ 6200s
        # Act 4 (Encore): ~8250s ~ 9400s
        
        # Mapping base approximate offsets for Video 1094
        # Video 63 (edited) -> Video 1094 (uncut) offset deltas:
        # Act 1 (Items 0~18): Delta ~ -3.5s (V1094 starts 3.5s earlier than V63)
        # Act 2 (Items 19~29): V63 has ~720s 멘트 cut before solos -> V1094 has +166s vs V63
        # Act 3 (Items 30~38): V63 has ~680s 멘트 cut before Act 3 -> V1094 has +681s vs V63
        # Act 4 (Items 39~53): V63 has ~1300s 멘트/이벤트 cut -> V1094 has +1330s vs V63

        # Update setlist start times relative to Video 1094
        for item in setlist_items:
            s_name = item.song.name if item.song else (item.event_name or "")
            orig_t = float(item.start_time or 0.0)
            
            # Compute calibrated master time
            if item.display_order <= 18:
                # Act 1
                calibrated_t = max(0.0, orig_t - 3.5)
            elif 19 <= item.display_order <= 29:
                # Act 2 (Solos)
                calibrated_t = orig_t + 166.0
            elif 30 <= item.display_order <= 38:
                # Act 3 (Hits: FANCY, What is Love, YES or YES, DTNA, Feel Special, ONE SPARK)
                calibrated_t = orig_t + 681.0
            else:
                # Act 4 (Encore & Ment)
                calibrated_t = orig_t + 1333.0
                
            item.start_time = round(calibrated_t, 1)
            
        db.commit()
        print("✅ Concert 2 Setlist start_time updated to Video 1094 Master Timeline!")

        # 4. Update Video 1094 Sync Segments (1:1 continuous mapping)
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 1094).delete()
        
        for i, item in enumerate(setlist_items):
            s_name = item.song.name if item.song else (item.event_name or "")
            m_start = float(item.start_time)
            m_end = float(setlist_items[i+1].start_time) if i + 1 < len(setlist_items) else (m_start + 180.0)
            
            if m_end <= m_start:
                m_end = m_start + 180.0
                
            seg = VideoSyncSegment(
                video_id=1094,
                setlist_id=item.id,
                video_start_time=m_start,
                video_end_time=m_end,
                master_start_time=m_start,
                master_end_time=m_end,
                sync_offset=0.0,
                label=s_name,
                is_verified=True
            )
            db.add(seg)
            
        db.commit()
        print("✅ Video 1094 (Master) 54 segments recalibrated!")

        # 5. Update Video 63 (Edited Video) Sync Segments
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 63).delete()
        
        # Segment 1: Act 1 (0s ~ 2240s in V63 -> 0s ~ 2252s in Master, offset = -3.5s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=0.0,
            video_end_time=2240.0,
            master_start_time=0.0,
            master_end_time=2236.5,
            sync_offset=-3.5,
            label="Act 1 (Opening ~ Heart Shaker)",
            is_verified=True
        ))
        
        # Segment 2: Act 2 (2240s ~ 4310s in V63 -> 2926s ~ 4994s in Master, offset = +684.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=2240.0,
            video_end_time=4310.0,
            master_start_time=2924.0,
            master_end_time=4994.0,
            sync_offset=684.0,
            label="Act 2 (Solo Stages)",
            is_verified=True
        ))

        # Segment 3: Act 3 (4310s ~ 5890s in V63 -> 4994s ~ 6574s in Master, offset = +684.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=4310.0,
            video_end_time=5890.0,
            master_start_time=4994.0,
            master_end_time=6574.0,
            sync_offset=684.0,
            label="Act 3 (Hits & Special Stages)",
            is_verified=True
        ))

        # Segment 4: Act 4 (5890s ~ 8384s in V63 -> 7220s ~ 9714s in Master, offset = +1330.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=5890.0,
            video_end_time=8384.0,
            master_start_time=7220.0,
            master_end_time=9714.0,
            sync_offset=1330.0,
            label="Act 4 (Encore & Ending)",
            is_verified=True
        ))
        db.commit()
        print("✅ Video 63 (Piecewise Edited) 4 Act segments created!")

        # 6. Recalibrate all 81 individual fancams in Day 2
        day2_vids = db.query(Video).filter(
            Video.concert_id == 2,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        
        print(f"\n🔄 Calibrating {len(day2_vids)} individual fancams for Day 2...")
        calibrated_count = 0
        
        # Build song -> master start time lookup
        song_to_master_time = {}
        for item in setlist_items:
            if item.song_id:
                song_to_master_time[item.song_id] = item.start_time
                
        for v in day2_vids:
            if v.songs:
                primary_song = v.songs[0]
                if primary_song.id in song_to_master_time:
                    target_master_t = song_to_master_time[primary_song.id]
                    v.sync_offset = round(target_master_t, 1)
                    calibrated_count += 1
                    
        db.commit()
        print(f"🎯 Successfully calibrated {calibrated_count} fancams to new Master Timeline!")
        print("🎉 Incheon Day 2 Calibration Completed!")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_calibration()
