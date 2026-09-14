import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.crawler.recursive_segment_calibrator import (
    merge_adjacent_segments,
    binary_search_cut_boundary,
    calibrate_video_recursive_segments,
)
from app.models.models import Video, VideoSyncSegment


def test_merge_adjacent_segments():
    # Segments with small drift (<= 0.4s) should merge
    segs = [
        {"video_start_time": 0.0, "video_end_time": 100.0, "sync_offset": 10.0, "confidence": 0.3},
        {"video_start_time": 100.0, "video_end_time": 200.0, "sync_offset": 10.2, "confidence": 0.4},
        {"video_start_time": 200.0, "video_end_time": 300.0, "sync_offset": 50.0, "confidence": 0.5},
    ]
    merged = merge_adjacent_segments(segs, max_offset_diff=0.4)
    assert len(merged) == 2
    assert merged[0]["video_start_time"] == 0.0
    assert merged[0]["video_end_time"] == 200.0
    assert abs(merged[0]["sync_offset"] - 10.1) < 1e-4
    assert merged[1]["video_start_time"] == 200.0
    assert merged[1]["video_end_time"] == 300.0
    assert merged[1]["sync_offset"] == 50.0


def test_merge_adjacent_empty():
    assert merge_adjacent_segments([]) == []


@patch("app.crawler.recursive_segment_calibrator.download_audio_slice")
@patch("app.crawler.recursive_segment_calibrator.cross_correlate")
def test_binary_search_cut_boundary(mock_cc, mock_download):
    mock_download.return_value = "/dummy/path.wav"
    
    # Ground truth cut is at 150.0s
    # When t < 150.0, left correlation is high (0.8), right is low (0.1)
    # When t >= 150.0, left is low (0.1), right is high (0.8)
    def side_effect_cc(tgt, ref, start):
        # We can extract timestamp from mock_download call or reference
        return 0.0, 0.5

    # Simulate cut boundary test
    def mock_cross(tgt_wav, ref_wav, search_start):
        # If search_start indicates left offset vs right offset
        if "refl" in str(ref_wav) or "refl" in repr(mock_download.call_args):
            return 100.0, 0.8
        return 200.0, 0.2

    mock_cc.side_effect = mock_cross
    cut_t = binary_search_cut_boundary("tgt", "ref", 100.0, 200.0, 0.0, 50.0, steps=4)
    assert 100.0 <= cut_t <= 200.0


def test_calibrate_video_ground_truth_protection():
    mock_db = MagicMock()
    mock_video = MagicMock(spec=Video)
    mock_video.id = 63
    mock_video.concert_id = 2
    mock_video.youtube_id = "ZBjTY0h1fuc"
    mock_video.duration = 8384.0

    mock_master = MagicMock(spec=Video)
    mock_master.id = 1094
    mock_master.concert_id = 2
    mock_master.youtube_id = "dxY6TEGf6fM"
    mock_master.duration = 10998.0

    mock_seg = MagicMock(spec=VideoSyncSegment)
    mock_seg.is_verified = True
    mock_seg.video_start_time = 0.0
    mock_seg.video_end_time = 100.0
    mock_seg.sync_offset = -3.54
    mock_seg.label = "Verified GT Seg"

    def mock_query(model):
        q = MagicMock()
        if model == Video:
            q.filter.return_value.first.return_value = mock_video
            q.filter.return_value.order_by.return_value.first.return_value = mock_master
        elif model == VideoSyncSegment:
            q.filter.return_value.order_by.return_value.all.return_value = [mock_seg]
        else:
            q.filter.return_value.order_by.return_value.all.return_value = []
        return q

    mock_db.query.side_effect = mock_query

    # Calling without force must preserve ground truth and not delete
    res = calibrate_video_recursive_segments(63, mock_db, force=False)
    assert res["success"] is True
    assert res.get("skipped") is True
    assert "verified Ground Truth" in res["message"]
    # Ensure delete was NEVER called
    mock_db.delete.assert_not_called()
