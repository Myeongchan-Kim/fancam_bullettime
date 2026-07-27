import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.main import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song
from sqlalchemy import func

db = SessionLocal()

def check_status():
    total_concerts = db.query(Concert).count()
    concerts_with_setlist = db.query(Concert.id).join(ConcertSetlist).distinct().count()
    
    zero_offset_count = db.query(Video).filter(
        Video.sync_offset == 0,
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).count()
    
    print(f"Total Concerts: {total_concerts}")
    print(f"Concerts with Setlist: {concerts_with_setlist}")
    print(f"Videos with zero offset (excluding full): {zero_offset_count}")
    
    print("\nTop Concerts with zero-offset videos:")
    results = db.query(Concert.city, Concert.date, func.count(Video.id)).join(Video).filter(
        Video.sync_offset == 0,
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).group_by(Concert.id).order_by(func.count(Video.id).desc()).limit(10).all()
    
    for city, date, count in results:
        sl_count = db.query(ConcertSetlist).join(Concert).filter(Concert.city == city, Concert.date == date).count()
        print(f"- {city} ({date}): {count} videos (Setlist items: {sl_count})")

if __name__ == "__main__":
    check_status()
    db.close()
