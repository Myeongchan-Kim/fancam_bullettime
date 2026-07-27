import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.main import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song

db = SessionLocal()

def check_concert_setlist(city):
    concert = db.query(Concert).filter(Concert.city == city).first()
    if not concert:
        print(f"Concert in {city} not found.")
        return
    
    print(f"Concert: {concert.city} ({concert.date})")
    setlist_items = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert.id).order_by(ConcertSetlist.display_order).all()
    
    print(f"Setlist items: {len(setlist_items)}")
    for item in setlist_items:
        song_name = item.song.name if item.song else item.event_name
        print(f"- {song_name}: start_time={item.start_time}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_concert_setlist(sys.argv[1])
    else:
        print("Usage: python backend/check_concert_setlist.py <city>")
    db.close()
