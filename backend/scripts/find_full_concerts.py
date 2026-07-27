import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.main import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song

db = SessionLocal()

def find_full_concert_videos(city):
    concert = db.query(Concert).filter(Concert.city == city).first()
    if not concert:
        print(f"Concert in {city} not found.")
        return
    
    videos = db.query(Video).filter(
        Video.concert_id == concert.id,
        (Video.angle == 'Full-Concert') | (Video.title.ilike('%Full Concert%'))
    ).all()
    
    print(f"Full Concert videos for {city}: {len(videos)}")
    for v in videos:
        print(f"- {v.title[:50]}... (ID: {v.id})")
        if v.description:
            print(f"  Description length: {len(v.description)}")

if __name__ == "__main__":
    cities = ["Hong Kong", "Melbourne", "Bangkok", "Orlando"]
    for city in cities:
        find_full_concert_videos(city)
    db.close()
