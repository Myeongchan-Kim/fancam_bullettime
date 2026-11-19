import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db import get_db
from app.api.v1.utils import verify_admin
from app.models.models import Base, Video


def test_patch_video_handles_legacy_double_encoded_or_null_members():
    """
    Regression test: PATCH /api/videos/{video_id} returned 500 Internal Server Error
    (ResponseValidationError) when updating sync_offset on legacy rows whose `members`
    column stored a double-encoded JSON string or None, because `update_video` omitted
    `ensure_list(video.members)` before response serialization.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSession()
    # Insert a video whose JSONEncodedList stores a serialized JSON string (double-encoded)
    v = Video(
        id=351,
        youtube_id="4GR-Y1bAuwA",
        title="TWICE - FULL Concert, Live in Oakland",
        thumbnail_url="https://i.ytimg.com/vi/4GR-Y1bAuwA/hqdefault.jpg",
        url="https://www.youtube.com/watch?v=4GR-Y1bAuwA",
        members='["Nayeon", "Momo"]',
        sync_offset=-211.0,
        duration=8075.0,
    )
    db.add(v)
    db.commit()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[verify_admin] = lambda: True

    try:
        client = TestClient(app)
        resp = client.patch(
            "/api/videos/351",
            json={
                "sync_offset": 37.93,
                "calibration_method": "full_master_spectral44_exact_pts",
                "calibration_status": "ai_calibrated",
            },
        )
        assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["sync_offset"] == 37.93
        assert body["members"] == ["Nayeon", "Momo"]
    finally:
        app.dependency_overrides.clear()
        db.close()
