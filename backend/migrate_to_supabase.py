import os
import json
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.models.models import Base, Video, Song, Concert, ConcertSetlist, Contribution

# .env 로드
load_dotenv()

SQLITE_URL = "sqlite:///twice_fancam.db"
POSTGRES_URL = os.getenv("DATABASE_URL")

if not POSTGRES_URL or "postgresql" not in POSTGRES_URL:
    print("❌ 에러: .env 파일에 올바른 DATABASE_URL(PostgreSQL 주소)이 설정되지 않았습니다.")
    sys.exit(1)

def migrate():
    print(f"🚀 마이그레이션 시작: SQLite -> Supabase (PostgreSQL)")
    
    # 엔진 생성
    sqlite_engine = create_engine(SQLITE_URL)
    pg_engine = create_engine(POSTGRES_URL)
    
    # 1. PostgreSQL에 테이블 생성 (만약 없다면)
    print("📋 Supabase에 테이블 구조를 생성 중...")
    Base.metadata.create_all(pg_engine)
    
    # 세션 생성
    SqliteSession = sessionmaker(bind=sqlite_engine)
    PgSession = sessionmaker(bind=pg_engine)
    
    sqlite_db = SqliteSession()
    pg_db = PgSession()
    
    try:
        # 2. 데이터 순차적 복사 (외래 키 제약 조건 고려하여 순서 중요)
        # 1) Songs
        print("🎵 Songs 복사 중...")
        songs = sqlite_db.query(Song).all()
        for s in songs:
            sqlite_db.expunge(s)
            pg_db.merge(s)
        pg_db.commit()
        print(f"   ✅ {len(songs)}개 곡 완료")

        # 2) Concerts
        print("🏟️ Concerts 복사 중...")
        concerts = sqlite_db.query(Concert).all()
        for c in concerts:
            sqlite_db.expunge(c)
            pg_db.merge(c)
        pg_db.commit()
        print(f"   ✅ {len(concerts)}개 콘서트 완료")

        # 3) ConcertSetlists
        print("📜 Setlists 복사 중...")
        setlists = sqlite_db.query(ConcertSetlist).all()
        for sl in setlists:
            sqlite_db.expunge(sl)
            pg_db.merge(sl)
        pg_db.commit()
        print(f"   ✅ {len(setlists)}개 셋리스트 아이템 완료")

        # 4) Videos (M:N 관계 포함)
        print("🎬 Videos 복사 중...")
        videos = sqlite_db.query(Video).all()
        for v in videos:
            # SQLAlchemy relationships(videos_song_association) 복사를 위해 
            # 연관된 songs도 함께 로드하여 merge
            sqlite_db.expunge(v)
            pg_db.merge(v)
        pg_db.commit()
        print(f"   ✅ {len(videos)}개 영상 완료")

        # 5) Contributions
        print("🤝 Contributions 복사 중...")
        contribs = sqlite_db.query(Contribution).all()
        for cb in contribs:
            sqlite_db.expunge(cb)
            pg_db.merge(cb)
        pg_db.commit()
        print(f"   ✅ {len(contribs)}개 기여 내역 완료")

        print("\n✨ 모든 데이터가 Supabase로 성공적으로 이전되었습니다!")

    except Exception as e:
        pg_db.rollback()
        print(f"❌ 마이그레이션 중 에러 발생: {e}")
    finally:
        sqlite_db.close()
        pg_db.close()

if __name__ == "__main__":
    migrate()
