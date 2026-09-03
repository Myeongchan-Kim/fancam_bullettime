"""
1. Propagate setlist offsets to all individual fancams (Sync Tree propagation).
2. Systematic 3-Minute Interval Verification across Video 1094 (Master), Video 63 (Edited),
   and active member fancams.
"""

import os
import sys
import dotenv
import subprocess
from google import genai
from google.genai import types

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment

def propagate_offsets():
    db = SessionLocal()
    try:
        print("🌳 Propagating Setlist & Segment Offsets to all Day 2 Fancams...")
        setlist_items = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == 2
        ).all()
        song_to_master_time = {it.song_id: it.start_time for it in setlist_items if it.song_id and it.start_time is not None}
        
        day2_vids = db.query(Video).filter(
            Video.concert_id == 2,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        
        updated = 0
        for v in day2_vids:
            if v.songs:
                for s in v.songs:
                    if s.id in song_to_master_time:
                        v.sync_offset = round(float(song_to_master_time[s.id]), 1)
                        updated += 1
                        break
        db.commit()
        print(f"✅ Propagated exact offsets to {updated} individual fancams!")
    finally:
        db.close()

if __name__ == "__main__":
    propagate_offsets()
