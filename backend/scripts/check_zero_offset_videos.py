import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.main import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song

db = SessionLocal()

def check_zero_offset_videos(city):
    concert = db.query(Concert).filter(Concert.city == city).first()
    if not concert:
        print(f"Concert in {city} not found.")
        return
    
    videos = db.query(Video).filter(
        Video.concert_id == concert.id,
        Video.sync_offset == 0,
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).all()
    
    print(f"Zero-offset videos for {city}: {len(videos)}")
    for v in videos:
        songs = [s.name for s in v.songs]
        print(f"- {v.title[:50]}... (Songs: {songs}, song_id: {v.song_id})")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_zero_offset_videos(sys.argv[1])
    db.close()
