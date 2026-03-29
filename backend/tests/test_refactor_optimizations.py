import pytest
import sys
import os
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.models.models import Base, Video, Song, Concert, ConcertSetlist
from ai_tag_videos import tag_video_with_songs
from ai_fix_setlist_times import find_setlist_item

# 테스트용 인메모리 DB 설정
@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_tag_video_with_songs_consistency(test_db):
    # 1. 테스트 데이터 준비
    song1 = Song(name="FANCY", order=1, is_solo=False)
    song2 = Song(name="Feel Special", order=2, is_solo=False)
    test_db.add_all([song1, song2])
    
    video = Video(title="TWICE FANCY Fancam", youtube_id="123", url="url", members=[], duration=200)
    test_db.add(video)
    test_db.commit()

    # 2. 검증할 데이터
    suggested_songs = ["Fancy", "FEEL SPECIAL", "Non-existent Song"]
    
    # --- [최적화 방식 (Song Map)] ---
    all_songs = test_db.query(Song).all()
    song_map = {s.name.lower(): s for s in all_songs}
    
    # 비디오 복제하여 동일 조건에서 비교
    video_optimized = Video(title="TWICE FANCY Fancam Opt", youtube_id="456", url="url", members=[], duration=200)
    test_db.add(video_optimized)
    test_db.commit()

    added_count = tag_video_with_songs(video_optimized, suggested_songs, song_map)

    # 3. 결과 검증
    assert added_count == 2
    assert len(video_optimized.songs) == 2
    assert any(s.name == "FANCY" for s in video_optimized.songs)
    assert any(s.name == "Feel Special" for s in video_optimized.songs)

def test_find_setlist_item_consistency(test_db):
    # 1. 테스트 데이터 준비
    concert = Concert(city="Seoul", date=date(2026, 3, 21), country="KR", venue="Dome")
    test_db.add(concert)
    test_db.commit()
    
    song = Song(name="FANCY", order=1, is_solo=False)
    test_db.add(song)
    test_db.commit()
    
    sl_item = ConcertSetlist(concert_id=concert.id, song_id=song.id, display_order=1, start_time=0)
    test_db.add(sl_item)
    test_db.commit()

    # 2. 최적화 데이터 준비 (Setlist Map)
    concert_setlist = test_db.query(ConcertSetlist).join(Song).filter(
        ConcertSetlist.concert_id == concert.id
    ).all()
    setlist_map = {sl.song.name.lower(): sl for sl in concert_setlist if sl.song}

    # 3. 검증
    # A. 맵을 사용한 조회
    found_opt = find_setlist_item(test_db, concert.id, "Fancy", setlist_map)
    assert found_opt is not None
    assert found_opt.id == sl_item.id

    # B. 맵 없이 DB 조회 (기존 방식)
    found_db = find_setlist_item(test_db, concert.id, "FANCY", None)
    assert found_db is not None
    assert found_db.id == sl_item.id

if __name__ == "__main__":
    pytest.main([__file__])
