import pytest
from app.core.youtube_utils import get_video_id, timestamp_to_seconds
from app.api.v1.utils import ensure_list, serialize_contribution
from app.models.models import Contribution


def test_get_video_id():
    assert get_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert get_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert get_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert get_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert get_video_id("") is None


def test_timestamp_to_seconds():
    assert timestamp_to_seconds("01:30") == 90.0
    assert timestamp_to_seconds("01:02:03") == 3723.0
    assert timestamp_to_seconds("") == 0.0


def test_ensure_list():
    assert ensure_list(None) == []
    assert ensure_list(["NAYEON", "SANA"]) == ["NAYEON", "SANA"]
    assert ensure_list('["MOMO", "MINA"]') == ["MOMO", "MINA"]
    assert ensure_list('" [\\"JIHYO\\", \\"TZUYU\\"] "') == ["JIHYO", "TZUYU"]
    assert ensure_list("not a json list") == []


def test_serialize_contribution():
    contrib = Contribution(
        id=1,
        video_id=10,
        suggested_title="Test Title",
        suggested_song_ids=[1, 2],
        suggested_members=["SANA"],
        suggested_coordinate_x=180.0,
        suggested_coordinate_y=15.0,
        suggested_sync_offset=123.45,
        is_processed=False,
    )
    res = serialize_contribution(contrib, video_title="Original Video")
    assert res["id"] == 1
    assert res["video_title"] == "Original Video"
    assert res["suggested_coordinate_x"] == 180.0
    assert res["suggested_coordinate_y"] == 15.0
    assert res["suggested_sync_offset"] == 123.45
    assert res["suggested_members"] == ["SANA"]


def test_elect_master_video_priority_and_fallback():
    from app.services.sync.master_election import elect_master_video
    from app.models.models import Video

    short_a = Video(id=1, concert_id=10, duration=400, is_unavailable=False)
    short_b = Video(id=2, concert_id=10, duration=900, is_unavailable=False)

    # Without fallback_to_any, videos <= 3600s and not marked 'master' return None
    assert elect_master_video(None, videos=[short_a, short_b], fallback_to_any=False) is None
    # With fallback_to_any=True, returns the longest available video
    elected_fb = elect_master_video(None, videos=[short_a, short_b], fallback_to_any=True)
    assert elected_fb is not None and elected_fb.id == 2

    # Explicit 'master' takes priority over duration
    explicit_master = Video(
        id=3, concert_id=10, duration=500, calibration_status="master", is_unavailable=False
    )
    long_non_master = Video(
        id=4, concert_id=10, duration=7200, sync_offset=0.0, is_unavailable=False
    )
    elected_explicit = elect_master_video(
        None, videos=[short_a, long_non_master, explicit_master]
    )
    assert elected_explicit is not None and elected_explicit.id == 3


def test_calibration_alignment_routes_require_verify_admin():
    from app.api.v1.calibration import router
    from app.api.v1.utils import verify_admin

    protected_paths = {
        "/api/videos/{video_id}/auto-align-segments",
        "/api/videos/{video_id}/recursive-segment-align",
    }
    matched_routes = [r for r in router.routes if getattr(r, "path", None) in protected_paths]
    assert len(matched_routes) == 2
    for route in matched_routes:
        dep_calls = [d.call for d in route.dependant.dependencies]
        assert verify_admin in dep_calls, f"Route {route.path} is missing verify_admin dependency"

