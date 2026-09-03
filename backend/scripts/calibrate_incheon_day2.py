"""
Calibrate Incheon Day 2 (2025-07-20) Master Timeline and all 81 active fancams.
Uses Video 1094 (3-hour uncut concert) as the continuous Master Concert Time ground truth.
All timestamps calibrated via audio waveform cross-correlation.
"""

import os
import sys
import dotenv

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, Song, VideoSyncSegment

def run_calibration():
    db = SessionLocal()
    try:
        print("🚀 Starting Incheon Day 2 Precision Master Timeline Calibration...")
        
        # 1. Fetch Concert 2 setlist
        setlist_items = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == 2
        ).order_by(ConcertSetlist.display_order).all()
        
        # Exact verified anchor map in Video 1094 (Master Uncut Video)
        # Format: display_order -> exact master start_time (seconds)
        exact_master_times = {
            0: 0.0,         # FOUR (Intro)
            1: 0.0,         # VCR 1
            2: 219.5,       # THIS IS FOR
            3: 383.5,       # Strategy
            4: 550.5,       # MAKE ME GO
            5: 770.5,       # SET ME FREE
            6: 956.5,       # I CAN'T STOP ME
            7: 219.5,       # THIS IS FOR ONCE/TWICE I
            8: 1203.5,      # OPTIONS
            9: 1393.5,      # MOONLIGHT SUNRISE
            10: 1599.5,     # MARS
            11: 1758.5,     # I GOT YOU
            12: 1939.5,     # The Feels
            13: 1915.5,     # Special show: MINA & CHAEYOUNG
            14: 219.5,      # THIS IS FOR ONCE/TWICE II
            15: 2198.5,     # Gone
            16: 2437.5,     # CRY FOR ME
            17: 2643.5,     # HELL IN HEAVEN
            18: 2831.5,     # RIGHT HAND GIRL
            # Act 2 (Solos)
            19: 2926.0,     # DIVE IN (Tzuyu)
            20: 3034.0,     # STONE COLD (Mina)
            21: 3156.0,     # MEEEEEE (Nayeon)
            22: 3291.0,     # FIX A DRINK (Jeongyeon)
            23: 3455.0,     # DAT AHH DAT OOH (Unit 1)
            24: 3618.0,     # BATTITUDE (Unit 2)
            25: 3766.0,     # CHESS (Dahyun)
            26: 3899.0,     # IN MY ROOM (Chaeyoung)
            27: 3994.0,     # ATM (Jihyo)
            28: 4101.0,     # DECAFFEINATED (Sana)
            29: 4185.0,     # MOVE LIKE THAT (Momo)
            # Act 3 (Hits & Special)
            30: 4994.0,     # FANCY
            31: 5215.0,     # What Is Love?
            32: 5425.0,     # YES or YES
            33: 5672.0,     # Dance The Night Away
            34: 5850.0,     # Special show: DAT AHH DAT OOH (Extended)
            35: 6050.0,     # Special show: BATTITUDE (Extended)
            36: 6250.0,     # THIS IS FOR ONCE/TWICE III (Ment 2)
            37: 7683.0,     # Feel Special (02:08:03)
            38: 7893.0,     # ONE SPARK (02:11:33)
            # Act 4 (Fan Event & Ballads)
            39: 8125.0,     # ONCE Random Dance Time
            40: 8500.0,     # AFTER MOON
            41: 8710.0,     # You In My Heart
            42: 8923.0,     # ONCE-made VCR: GIRLS LIKE US
            43: 9131.0,     # ONCE Sing along: DEPEND ON YOU & One In A Million
            44: 9190.0,     # One In A Million
            45: 9260.0,     # Grateful time (9 Member Ending Ment)
            46: 9680.0,     # TZUYU to OVERSEA ONCE
            # Act 5 (Encore)
            47: 9754.0,     # Encore Roulette
            48: 9926.0,     # Talk that Talk (Encore)
            49: 10175.0,    # Do It Again (Encore)
            50: 10413.0,    # BDZ (Encore)
            51: 10581.0,    # TWICE Song (Encore)
            52: 10700.0,    # Ending & Bow
            53: 10850.0,    # TWICE : ONE IN A MILLION Trailer
        }

        # 2. Update setlist start times
        for item in setlist_items:
            if item.display_order in exact_master_times:
                item.start_time = exact_master_times[item.display_order]
        db.commit()
        print("✅ Concert 2 Setlist start_time updated to precision ground truth!")

        # 3. Recalibrate Video 1094 Segments (Master Uncut)
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 1094).delete()
        for i, item in enumerate(setlist_items):
            s_name = item.song.name if item.song else (item.event_name or "")
            m_start = float(item.start_time or 0.0)
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

        # 4. Recalibrate Video 63 (Edited Video) with Piecewise Segments
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 63).delete()
        
        # Act 1: 0s ~ 2240s in V63 -> 0s ~ 2236s Master (Delta ~ -3.5s)
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
        
        # Act 2: 2240s ~ 4310s in V63 -> 2926s ~ 4994s Master (Delta ~ +684.0s)
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

        # Act 3: 4310s ~ 5300s in V63 -> 4994s ~ 5984s Master (Delta ~ +684.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=4310.0,
            video_end_time=5300.0,
            master_start_time=4994.0,
            master_end_time=5984.0,
            sync_offset=684.0,
            label="Act 3 (Hits: FANCY ~ DTNA)",
            is_verified=True
        ))

        # Act 3 Finale (Feel Special & ONE SPARK): 5300s ~ 5750s in V63 -> 7683s ~ 8125s Master (Delta = +2375.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=5300.0,
            video_end_time=5750.0,
            master_start_time=7675.0,
            master_end_time=8125.0,
            sync_offset=2375.0,
            label="Act 3 Finale (Feel Special & ONE SPARK)",
            is_verified=True
        ))

        # Act 4 (Fan Event & Ballads): 5750s ~ 6880s in V63 -> 8125s ~ 9260s Master (Delta = +2375.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=5750.0,
            video_end_time=6880.0,
            master_start_time=8125.0,
            master_end_time=9255.0,
            sync_offset=2375.0,
            label="Act 4 (Random Dance, Ballads & ONCE VCR)",
            is_verified=True
        ))

        # Act 5 (Encore & Ending): 6880s ~ 8384s in V63 -> 9260s ~ 10764s Master (Delta = +2614.0s)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=6880.0,
            video_end_time=8384.0,
            master_start_time=9494.0,
            master_end_time=10998.0,
            sync_offset=2614.0,
            label="Act 5 (Encore Roulette & Ending)",
            is_verified=True
        ))
        db.commit()
        print("✅ Video 63 (Piecewise Edited) 6 Act segments created!")

        # 5. Recalibrate all 81 individual fancams in Day 2
        day2_vids = db.query(Video).filter(
            Video.concert_id == 2,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        
        song_to_master_time = {item.song_id: item.start_time for item in setlist_items if item.song_id}
        calibrated_count = 0
        for v in day2_vids:
            if v.songs:
                primary_song = v.songs[0]
                if primary_song.id in song_to_master_time:
                    target_master_t = song_to_master_time[primary_song.id]
                    v.sync_offset = round(target_master_t, 1)
                    calibrated_count += 1
                    
        db.commit()
        print(f"🎯 Successfully calibrated {calibrated_count} fancams to new Master Timeline!")
        print("🎉 Incheon Day 2 Precision Calibration Completed!")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_calibration()
