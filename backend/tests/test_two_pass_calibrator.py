import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.crawler.two_pass_calibrator import (
    probe_local,
    find_setlist_landmark,
    pass1_generate_coarse_frames,
    pass2_refine_bounded_frame,
    run_two_pass_pipeline,
    calibrate_video_with_two_pass,
)
from app.models.models import Video, VideoSyncSegment


def test_pass2_refine_bounded_frame_strict_boundaries():
    """Verify Pass 2 never exceeds [t_start, t_end] boundary."""
    with patch("app.crawler.two_pass_calibrator.probe_local") as mock_probe, \
         patch("app.crawler.two_pass_calibrator.binary_search_cut_boundary") as mock_cut:
        
        # When probing left (t=106), offset=10.0. When probing right (t=294), offset=20.0 (drift=10.0s > 1.0s)
        def side_effect_probe(yt_t, yt_r, t, base_off, search_win=60.0, dur=8.0, prefix="tp_probe"):
            if t < 200.0:
                return {"success": True, "offset": 10.0, "conf": 0.5, "master_time": t + 10.0}
            return {"success": True, "offset": 20.0, "conf": 0.5, "master_time": t + 20.0}

        mock_probe.side_effect = side_effect_probe
        mock_cut.return_value = 200.0

        t_start = 100.0
        t_end = 300.0
        segs = pass2_refine_bounded_frame("tgt", "ref", t_start, t_end, base_offset=10.0, max_depth=2)

        # Assert strict bounds
        assert len(segs) >= 2
        for s in segs:
            assert s["video_start_time"] >= t_start, f"Segment start {s['video_start_time']} < {t_start}"
            assert s["video_end_time"] <= t_end, f"Segment end {s['video_end_time']} > {t_end}"

        assert segs[0]["video_start_time"] == t_start
        assert segs[-1]["video_end_time"] == t_end


def test_pass2_refine_bounded_frame_stable():
    """Verify Pass 2 returns single interval if no offset drift occurs."""
    with patch("app.crawler.two_pass_calibrator.probe_local") as mock_probe:
        mock_probe.return_value = {"success": True, "offset": 15.0, "conf": 0.6, "master_time": 115.0}

        segs = pass2_refine_bounded_frame("tgt", "ref", 50.0, 150.0, base_offset=15.0)
        assert len(segs) == 1
        assert segs[0]["video_start_time"] == 50.0
        assert segs[0]["video_end_time"] == 150.0
        assert segs[0]["sync_offset"] == 15.0


def test_pass1_generate_coarse_frames():
    """Verify Pass 1 macro skeleton correctly discovers cut boundaries."""
    with patch("app.crawler.two_pass_calibrator.find_setlist_landmark") as mock_find_sl, \
         patch("app.crawler.two_pass_calibrator.probe_local") as mock_probe:

        mock_find_sl.return_value = {"success": True, "offset": 50.0, "conf": 0.7, "name": "Song 1"}

        # First 180s offset is 50.0, from 180s onward offset jumps to 150.0
        def side_effect_probe(yt_t, yt_r, t, base_off, search_win=60.0, dur=8.0, prefix="tp_probe"):
            if t < 180.0:
                return {"success": True, "offset": 50.0, "conf": 0.5, "master_time": t + 50.0}
            return {"success": True, "offset": 150.0, "conf": 0.5, "master_time": t + 150.0}

        mock_probe.side_effect = side_effect_probe

        frames = pass1_generate_coarse_frames(
            "tgt", "ref", total_dur=360.0, setlists=[], coarse_step=90.0, initial_offset_hint=50.0
        )

        assert len(frames) == 2
        assert frames[0]["start"] == 0.0
        assert frames[0]["end"] == 180.0
        assert frames[0]["offset"] == 50.0

        assert frames[1]["start"] == 180.0
        assert frames[1]["end"] == 360.0
        assert frames[1]["offset"] == 150.0


def test_run_two_pass_pipeline_mode_b():
    """Mode B: Uses pre-set bounded frames directly without running Pass 1."""
    custom_frames = [
        {"start": 0.0, "end": 100.0, "offset": 10.0},
        {"start": 100.0, "end": 200.0, "offset": 80.0}
    ]

    with patch("app.crawler.two_pass_calibrator.pass1_generate_coarse_frames") as mock_p1, \
         patch("app.crawler.two_pass_calibrator.pass2_refine_bounded_frame") as mock_p2:

        mock_p2.side_effect = lambda yt_t, yt_r, s, e, off, **kwargs: [
            {"video_start_time": s, "video_end_time": e, "sync_offset": off, "confidence": 0.5}
        ]

        result = run_two_pass_pipeline(
            "tgt", "ref", total_dur=200.0, setlists=[], coarse_frames=custom_frames
        )

        # Pass 1 should NOT be called in Mode B
        mock_p1.assert_not_called()
        assert len(result) == 2
        assert result[0]["video_start_time"] == 0.0
        assert result[0]["video_end_time"] == 100.0
        assert result[1]["video_start_time"] == 100.0
        assert result[1]["video_end_time"] == 200.0


def test_calibrate_video_two_pass_gt_protection():
    """Verify is_verified Ground Truth segments are protected unless force=True."""
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
    mock_seg.label = "Human Ground Truth"

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

    # Calling without force
    res = calibrate_video_with_two_pass(mock_db, video_id=63, force=False)
    assert res["success"] is True
    assert res.get("skipped") is True
    assert "verified Ground Truth" in res["message"]
    mock_db.delete.assert_not_called()

