import sys
import os
import re

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, Song

from app.main import SessionLocal
from app.models.models import Video, Song

db = SessionLocal()

def local_tag_videos():
    print("🚀 Local Keyword-based Song Tagging Start...")
    
    # 1. Get all songs
    all_songs = db.query(Song).all()
    
    # 2. Get untagged videos
    untagged_videos = db.query(Video).filter(
        ~Video.songs.any(),
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).all()
    
    print(f"🔍 Found {len(untagged_videos)} untagged videos.")
    
    updated_count = 0
    
    for video in untagged_videos:
        found_songs = []
        title_lower = video.title.lower()
        
        for song in all_songs:
            # Simple keyword matching
            song_name_lower = song.name.lower()
            
            # Clean up song name for matching (e.g., "(Solo)", "(Encore)")
            clean_name = re.sub(r'\(.*?\)', '', song_name_lower).strip()
            
            if len(clean_name) < 3: # Skip very short names like "TT" for now or handle specifically
                if f" {clean_name} " in f" {title_lower} " or title_lower.endswith(clean_name) or title_lower.startswith(clean_name):
                    found_songs.append(song)
                continue

            if clean_name in title_lower:
                found_songs.append(song)
        
        # Specific handling for Solo stages if title contains "Solo" and member name
        members = ["nayeon", "jeongyeon", "momo", "sana", "jihyo", "mina", "dahyun", "chaeyoung", "tzuyu"]
        if "solo" in title_lower:
            for m in members:
                if m in title_lower:
                    # Find the solo song for this member
                    solo_song = next((s for s in all_songs if s.is_solo and s.member_name and s.member_name.lower() == m), None)
                    if solo_song and solo_song not in found_songs:
                        found_songs.append(solo_song)

        # Remove duplicates
        found_songs = list(set(found_songs))
        
        if found_songs:
            for s in found_songs:
                if s not in video.songs:
                    video.songs.append(s)
            updated_count += 1
            print(f"✅ [{video.id}] {video.title[:40]}... -> Tagged: {', '.join([s.name for s in found_songs])}")

    db.commit()
    print(f"\n✨ Tagged {updated_count} videos.")

if __name__ == "__main__":
    local_tag_videos()
    db.close()
