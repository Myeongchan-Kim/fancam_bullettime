import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.getcwd())

from backend.app.models.models import Base, Concert, Song, ConcertSetlist

DATABASE_URL = "sqlite:///backend/twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def time_to_seconds(time_str):
    parts = list(map(int, time_str.split(':')))
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0

def migrate_la_day4():
    db = SessionLocal()
    
    # 1. 신규 노래 등록 (솔로 곡 등)
    new_songs = [
        {"name": "DIVE IN", "member_name": "Tzuyu", "is_solo": True},
        {"name": "CHESS", "member_name": "Dahyun", "is_solo": True},
        {"name": "Dancers Bridge", "is_solo": False},
        {"name": "Band Bridge", "is_solo": False},
        {"name": "Fan Dance Cam", "is_solo": False},
        {"name": "ONCE Tribute Video", "is_solo": False},
        {"name": "Talk that Talk", "is_solo": False},
        {"name": "DIVE IN (Solo Stage)", "member_name": "Tzuyu", "is_solo": True},
    ]
    
    for s in new_songs:
        exists = db.query(Song).filter(Song.name == s["name"]).first()
        if not exists:
            new_song = Song(name=s["name"], member_name=s.get("member_name"), is_solo=s.get("is_solo", False))
            db.add(new_song)
    db.commit()

    # 2. LA 콘서트 확인/생성
    c_date = datetime(2026, 1, 25)
    concert = db.query(Concert).filter(Concert.city == "Los Angeles", Concert.date == c_date).first()
    if not concert:
        concert = Concert(
            date=c_date,
            city="Los Angeles",
            country="USA",
            venue="KIA FORUM"
        )
        db.add(concert)
        db.commit()
        db.refresh(concert)
    
    print(f"LA Concert ID: {concert.id}")

    # 3. 셋리스트 데이터 (Name, Timestamp)
    raw_data = [
        ("00:00", "THIS IS FOR", "THIS IS FOR"),
        ("02:36", "Strategy", "Strategy"),
        ("05:34", "MAKE ME GO", "MAKE ME GO"),
        ("08:53", "SET ME FREE", "SET ME FREE"),
        ("12:12", "I CAN'T STOP ME", "I CAN'T STOP ME"),
        ("16:05", "OPTIONS", "OPTIONS"),
        ("19:32", "MOONLIGHT SUNRISE", "MOONLIGHT SUNRISE"),
        ("22:44", "Dancers bridge", "Dancers Bridge"),
        ("26:48", "MARS", "MARS"),
        ("29:25", "I GOT YOU", "I GOT YOU"),
        ("32:27", "The Feels", "The Feels"),
        ("36:03", "Gone", "Gone"),
        ("40:07", "CRY FOR ME", "CRY FOR ME"),
        ("43:35", "HELL IN HEAVEN", "Hell In Heaven"),
        ("46:36", "RIGHT HAND GIRL", "RIGHT HAND GIRL"),
        ("49:15", "Band Bridge", "Band Bridge"),
        ("53:07", "DIVE IN (Tzuyu Solo)", "DIVE IN"),
        ("54:57", "STONE COLD (Mina Solo)", "STONE COLD (MINA)"),
        ("57:04", "MEEEEEE (Nayeon Solo)", "MEEEEEE (NAYEON)"),
        ("59:35", "FIX A DRINK (Jeongyeon Solo)", "FIX A DRINK (JEONGYEON)"),
        ("1:01:27", "CHESS (Dahyun Solo)", "CHESS"),
        ("1:03:54", "SHOOT (Firecracker) (Chaeyoung Solo)", "SHOOT (CHAEYOUNG)"),
        ("1:06:00", "ATM (Jihyo Solo)", "ATM (JIHYO)"),
        ("1:07:54", "Decaffeinated (Sana Solo)", "DECAFFEINATED (SANA)"),
        ("1:09:21", "MOVE LIKE THAT (Momo Solo)", "MOVE LIKE THAT (MOMO)"),
        ("1:11:46", "TAKEDOWN (TWICE Ver.)", "TAKE DOWN (JEONGYEON JIHYO CHAEYOUNG)"),
        ("1:16:16", "FANCY", "FANCY"),
        ("1:19:50", "What is Love?", "What is Love?"),
        ("1:23:22", "YES or YES", "YES or YES (MINA : HEY TAIPEI)"), # Map to common song
        ("1:27:29", "Dance the Night Away", "Dance The Night Away"),
        ("1:30:41", "Second Ment", "TALK 2"), # Map to Talk 2
        ("1:32:52", "One Spark", "ONE SPARK"),
        ("1:36:44", "Fan Dance Cam", "Fan Dance Cam"),
        ("1:44:06", "FEEL SPECIAL", "Feel Special"),
        ("1:47:47", "ONCE Tribute Video", "ONCE Tribute Video"),
        ("1:54:50", "TALK THAT TALK", "Talk that Talk"),
        ("1:59:00", "The TWICE Song (Encore)", "TWICE Song (Encore)"),
    ]

    # Clear existing setlist for LA
    db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert.id).delete()
    
    for i, (time_str, event_name, song_match_name) in enumerate(raw_data):
        seconds = time_to_seconds(time_str)
        song_obj = db.query(Song).filter(Song.name == song_match_name).first()
        
        setlist_entry = ConcertSetlist(
            concert_id=concert.id,
            song_id=song_obj.id if song_obj else None,
            event_name=event_name,
            start_time=float(seconds),
            display_order=i
        )
        db.add(setlist_entry)
        
    db.commit()
    print(f"Successfully updated Los Angeles Day 4 setlist with {len(raw_data)} entries.")
    db.close()

if __name__ == "__main__":
    migrate_la_day4()
