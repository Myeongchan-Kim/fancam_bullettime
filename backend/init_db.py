import os
import json
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Base, Song, Concert

DATABASE_URL = "sqlite:///./twice_fancam.db" # 초기 개발은 SQLite 사용
TOUR_DATA_PATH = os.path.join(os.path.dirname(__file__), "app", "data", "tour_info.json")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # 1. Songs 초기화
    print("곡 데이터 초기화 중...")
    for song_name in data["setlist"]["group_acts"]:
        if not db.query(Song).filter(Song.name == song_name).first():
            db.add(Song(name=song_name, is_solo=False))
            
    for solo in data["setlist"]["solo_stages"]:
        if not db.query(Song).filter(Song.name == solo["song"]).first():
            db.add(Song(name=solo["song"], is_solo=True, member_name=solo["member"]))
    
    # 2. Concerts 초기화
    print("공연 일정 초기화 중...")
    for s in data["schedule"]:
        date_obj = datetime.strptime(s["date"], "%Y-%m-%d")
        if not db.query(Concert).filter(Concert.date == date_obj, Concert.city == s["city"]).first():
            db.add(Concert(
                date=date_obj,
                city=s["city"],
                country=s["country"],
                venue=s["venue"]
            ))
            
    db.commit()
    db.close()
    print("데이터베이스 초기화 완료!")

if __name__ == "__main__":
    init_db()
