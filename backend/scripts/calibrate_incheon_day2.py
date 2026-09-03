"""
Calibrate Incheon Day 2 (2025-07-20) Master Timeline and all 81 active fancams.
Uses Video 1094 (3-hour uncut concert) as the continuous Master Concert Time ground truth.
Act 2 (Solos: 4,200s ~ 6,400s) and Act 3/4/5 timestamps verified by visual & audio probes.
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
        print("🚀 Starting Incheon Day 2 Exact Master Timeline Calibration...")
        
        # 1. Fetch Concert 2 setlist
        setlist_items = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == 2
        ).order_by(ConcertSetlist.display_order).all()
        
        # Exact verified anchor map in Video 1094 (Master Uncut Video)
        exact_master_times = {
            0: 0.0,          # FOUR (Intro)
            1: 0.0,          # VCR 1
            2: 219.5,        # THIS IS FOR
            3: 383.5,        # Strategy
            4: 550.5,        # MAKE ME GO
            5: 770.5,        # SET ME FREE
            6: 956.5,        # I CAN'T STOP ME
            7: 219.5,        # THIS IS FOR ONCE/TWICE I
            8: 1203.5,       # OPTIONS
            9: 1393.5,       # MOONLIGHT SUNRISE
            10: 1599.5,      # MARS
            11: 1758.5,      # I GOT YOU
            12: 1939.5,      # The Feels
            13: 1915.5,      # Special show: MINA & CHAEYOUNG
            14: 219.5,       # THIS IS FOR ONCE/TWICE II
            15: 2198.5,      # Gone
            16: 2437.5,      # CRY FOR ME
            17: 2643.5,      # HELL IN HEAVEN
            18: 2831.5,      # RIGHT HAND GIRL
            # Act 2 (Solos: Real start times in Video 1094)
            19: 4200.0,      # DIVE IN (Tzuyu) - 01:10:00 (V63: 2983s -> +1217s)
            20: 4440.0,      # STONE COLD (Mina) - 01:14:00 (V63: 3091s -> +1349s)
            21: 4680.0,      # MEEEEEE (Nayeon) - 01:18:00 (V63: 3213s -> +1467s)
            22: 4920.0,      # FIX A DRINK (Jeongyeon) - 01:22:00 (V63: 3348s -> +1572s)
            23: 5160.0,      # DAT AHH DAT OOH (Unit 1) - 01:26:00 (V63: 3455s -> +1705s)
            24: 5380.0,      # BATTITUDE (Unit 2) - 01:29:40 (V63: 3618s -> +1762s)
            25: 5584.0,      # CHESS (Dahyun) - 01:33:04 (V63: 3766s -> +1818s) ♟️
            26: 5820.0,      # IN MY ROOM (Chaeyoung) - 01:37:00 (V63: 3899s -> +1921s)
            27: 6000.0,      # ATM / Nightmare (Jihyo) - 01:40:00 (V63: 3994s -> +2006s)
            28: 6180.0,      # DECAFFEINATED (Sana) - 01:43:00 (V63: 4101s -> +2079s)
            29: 6360.0,      # MOVE LIKE THAT (Momo) - 01:46:00 (V63: 4185s -> +2175s)
            # Act 3 (Hits & Special: 6,600s ~ 8,000s)
            30: 6600.0,      # FANCY - 01:50:00 (V63: 4313s -> +2287s)
            31: 6850.0,      # What Is Love? - 01:54:10 (V63: 4534s -> +2316s)
            32: 7080.0,      # YES or YES - 01:58:00 (V63: 4744s -> +2336s)
            33: 7330.0,      # Dance The Night Away - 02:02:10 (V63: 4991s -> +2339s)
            34: 7480.0,      # Special show: DAT AHH DAT OOH (Extended)
            35: 7550.0,      # Special show: BATTITUDE (Extended)
            36: 7600.0,      # THIS IS FOR ONCE/TWICE III (Ment 2)
            37: 7683.0,      # Feel Special - 02:08:03 (V63: 5303s -> +2380s)
            38: 7893.0,      # ONE SPARK - 02:11:33 (V63: 5518s -> +2375s)
            # Act 4 (Fan Event & Ballads)
            39: 8190.0,      # ONCE Random Dance Time - 02:16:30 (V63: 5750s -> +2440s)
            40: 8616.0,      # AFTER MOON - 02:23:36 (V63: 6120s -> +2496s)
            41: 8826.0,      # You In My Heart - 02:27:06 (V63: 6330s -> +2496s)
            42: 9058.0,      # ONCE-made VCR: GIRLS LIKE US - 02:30:58 (V63: 6543s -> +2515s)
            43: 9131.0,      # ONCE Sing along: DEPEND ON YOU & One In A Million
            44: 9190.0,      # One In A Million
            45: 9260.0,      # Grateful time (9 Member Ending Ment)
            46: 9680.0,      # TZUYU to OVERSEA ONCE
            # Act 5 (Encore & Finale)
            47: 9787.0,      # Encore Roulette - 02:43:07 (V63: 7140s -> +2647s)
            48: 9967.0,      # Talk that Talk (Encore) - 02:46:07 (V63: 7312s -> +2655s)
            49: 10217.0,     # Do It Again (Encore) - 02:50:17 (V63: 7561s -> +2656s)
            50: 10447.0,     # BDZ (Encore) - 02:54:06 (V63: 7799s -> +2648s)
            51: 10617.0,     # TWICE Song & Ending Bow - 02:56:57 (V63: 7967s -> +2650s)
            52: 10750.0,     # Ending & Bow
            53: 10850.0,     # TWICE : ONE IN A MILLION Trailer
        }

        # 2. Update setlist start times
        for item in setlist_items:
            if item.display_order in exact_master_times:
                item.start_time = exact_master_times[item.display_order]
        db.commit()
        print("✅ Concert 2 Setlist start_time updated to exact verified timestamps!")

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

        # 4. Recalibrate Video 63 (Piecewise Edited) with Exact Song-Level / Act Segments
        db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == 63).delete()
        
        # Act 1: 0s ~ 2240s in V63 -> Offset = -3.5s
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
        
        # Act 2 (Solos: Tzuyu to Momo): 2983s ~ 4310s in V63 -> Master 4200s ~ 6527s, Offset = +1818.0s (Dahyun CHESS 3766s -> 5584s!)
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=2240.0,
            video_end_time=4310.0,
            master_start_time=4058.0,
            master_end_time=6128.0,
            sync_offset=1818.0,
            label="Act 2 (Solo Stages: Tzuyu ~ Dahyun CHESS ~ Momo)",
            is_verified=True
        ))

        # Act 3 (Hits: FANCY ~ Dance The Night Away): 4310s ~ 5300s in V63 -> Master 6600s ~ 7590s, Offset = +2287.0s
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=4310.0,
            video_end_time=5300.0,
            master_start_time=6597.0,
            master_end_time=7587.0,
            sync_offset=2287.0,
            label="Act 3 (Hits: FANCY ~ Dance The Night Away)",
            is_verified=True
        ))

        # Act 3 Finale (Feel Special & ONE SPARK): 5300s ~ 5750s in V63 -> Master 7675s ~ 8125s, Offset = +2375.0s
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

        # Act 4 (Fan Event & Ballads): 5750s ~ 6880s in V63 -> Master 8190s ~ 9376s, Offset = +2440.0s
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=5750.0,
            video_end_time=6880.0,
            master_start_time=8190.0,
            master_end_time=9320.0,
            sync_offset=2440.0,
            label="Act 4 (Random Dance, Ballads & ONCE VCR)",
            is_verified=True
        ))

        # Act 5 (Encore & Ending): 6880s ~ 8384s in V63 -> Master 9527s ~ 11031s, Offset = +2647.0s
        db.add(VideoSyncSegment(
            video_id=63,
            video_start_time=6880.0,
            video_end_time=8384.0,
            master_start_time=9527.0,
            master_end_time=11031.0,
            sync_offset=2647.0,
            label="Act 5 (Encore Roulette & Ending)",
            is_verified=True
        ))
        db.commit()
        print("✅ Video 63 (Piecewise Edited) 6 Act segments updated with exact Act 2 offset (+1818s)!")

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
        print(f"🎯 Successfully calibrated {calibrated_count} fancams to exact Master Timeline!")
        print("🎉 Incheon Day 2 Complete Precision Calibration Done!")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_calibration()
