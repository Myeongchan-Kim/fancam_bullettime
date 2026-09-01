import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, selectinload, joinedload
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.models.models import Base, Video, Song, Concert, ConcertSetlist, Contribution
from app.main import app
from app.db import get_db

@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield session
    
    app.dependency_overrides.clear()
    session.close()

def test_selectinload_and_relationships(test_db_session):
    concert = Concert(city="Incheon", date=datetime(2025, 7, 19), country="KR", venue="Asiad Stadium")
    test_db_session.add(concert)
    test_db_session.commit()

    song1 = Song(name="Set Me Free", order=1)
    song2 = Song(name="I Can't Stop Me", order=2)
    test_db_session.add_all([song1, song2])
    test_db_session.commit()

    setlist1 = ConcertSetlist(concert_id=concert.id, song_id=song1.id, display_order=1, start_time=100.0)
    setlist2 = ConcertSetlist(concert_id=concert.id, song_id=song2.id, display_order=2, start_time=320.0)
    test_db_session.add_all([setlist1, setlist2])
    test_db_session.commit()

    video1 = Video(
        youtube_id="vid_001",
        title="TWICE Set Me Free Nayeon Fancam",
        url="https://youtube.com/watch?v=vid_001",
        thumbnail_url="https://img.youtube.com/vi/vid_001/0.jpg",
        concert_id=concert.id,
        members=["Nayeon"],
        sync_offset=100.0,
        duration=200.0
    )
    video1.songs = [song1, song2]
    test_db_session.add(video1)
    test_db_session.commit()

    queried = test_db_session.query(Video).options(
        selectinload(Video.songs),
        joinedload(Video.concert)
    ).filter(Video.id == video1.id).first()

    assert queried is not None
    assert len(queried.songs) == 2
    assert queried.concert.city == "Incheon"
    assert len(queried.concert.setlist) == 2
    assert queried.concert.setlist[0].song.name == "Set Me Free"

def test_api_get_videos_and_single_concert(test_db_session):
    client = TestClient(app)

    concert = Concert(city="Tokyo", date=datetime(2025, 8, 1), country="JP", venue="Tokyo Dome")
    test_db_session.add(concert)
    test_db_session.commit()

    song = Song(name="Hare Hare", order=3)
    test_db_session.add(song)
    test_db_session.commit()

    video = Video(
        youtube_id="vid_002",
        title="TWICE Hare Hare Sana Focus",
        url="https://youtube.com/watch?v=vid_002",
        thumbnail_url="https://img.youtube.com/vi/vid_002/0.jpg",
        concert_id=concert.id,
        members=["Sana"],
        sync_offset=500.0,
        duration=180.0
    )
    video.songs = [song]
    test_db_session.add(video)
    test_db_session.commit()

    resp = client.get("/api/videos?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "videos" in data
    assert "total_count" in data
    assert len(data["videos"]) >= 1

    c_resp = client.get(f"/api/concerts/{concert.id}")
    assert c_resp.status_code == 200
    c_data = c_resp.json()
    assert c_data["city"] == "Tokyo"
    assert c_data["video_count"] == 1
