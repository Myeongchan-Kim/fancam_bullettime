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
