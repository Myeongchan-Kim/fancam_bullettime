import pytest
from app.services.backbone_consensus import (
    compare_relative_elapsed_time,
    build_composite_spine_segments
)

def test_compare_relative_elapsed_time_both_continuous():
    res = compare_relative_elapsed_time(
        t1_a=100.0, t1_b=200.0,
        t2_a=50.0, t2_b=150.1,
        tolerance=0.4
    )
    assert res["status"] == "both_continuous"
    assert res["winner"] == "both"
    assert res["cut_video"] is None
    assert abs(res["drift"]) <= 0.4
    assert res["pause_duration"] == 0.0


def test_compare_relative_elapsed_time_v2_cut():
    # V1 runs 100s, V2 runs only 80s (20s cut in V2)
    res = compare_relative_elapsed_time(
        t1_a=100.0, t1_b=200.0,
        t2_a=50.0, t2_b=130.0,
        tolerance=0.4
    )
    assert res["status"] == "v2_cut_detected"
    assert res["winner"] == "v1"
    assert res["cut_video"] == "v2"
    assert res["pause_duration"] == 20.0
    assert res["drift"] == 20.0


def test_compare_relative_elapsed_time_v1_cut():
    # V1 runs 70s, V2 runs 100s (30s cut in V1)
    res = compare_relative_elapsed_time(
        t1_a=100.0, t1_b=170.0,
        t2_a=50.0, t2_b=150.0,
        tolerance=0.4
    )
    assert res["status"] == "v1_cut_detected"
    assert res["winner"] == "v2"
    assert res["cut_video"] == "v1"
    assert res["pause_duration"] == 30.0
    assert res["drift"] == -30.0


def test_build_composite_spine_segments():
    intervals = [
        # 1. Both continuous for 60s
        {
            "status": "both_continuous",
            "winner": "both",
            "cut_video": None,
            "dt1": 60.0,
            "dt2": 60.0,
            "pause_duration": 0.0,
            "interval_v1": (0.0, 60.0),
            "interval_v2": (10.0, 70.0)
        },
        # 2. V2 paused for 15s (V1 continuous for 60s)
        {
            "status": "v2_cut_detected",
            "winner": "v1",
            "cut_video": "v2",
            "dt1": 60.0,
            "dt2": 45.0,
            "pause_duration": 15.0,
            "interval_v1": (60.0, 120.0),
            "interval_v2": (70.0, 115.0)
        },
        # 3. V1 paused for 20s (V2 continuous for 60s)
        {
            "status": "v1_cut_detected",
            "winner": "v2",
            "cut_video": "v1",
            "dt1": 40.0,
            "dt2": 60.0,
            "pause_duration": 20.0,
            "interval_v1": (120.0, 160.0),
            "interval_v2": (115.0, 175.0)
        }
    ]

    spine = build_composite_spine_segments(v1_id=1, v2_id=2, intervals=intervals, v1_initial_offset=0.0)

    assert len(spine) == 3
    # Seg 1: 0 to 60s
    assert spine[0]["master_start"] == 0.0
    assert spine[0]["master_end"] == 60.0
    assert spine[0]["authoritative_video_id"] == 1

    # Seg 2: 60 to 120s (V1 won)
    assert spine[1]["master_start"] == 60.0
    assert spine[1]["master_end"] == 120.0
    assert spine[1]["authoritative_video_id"] == 1
    assert spine[1]["cut_video"] == "v2"

    # Seg 3: 120 to 180s (V2 won)
    assert spine[2]["master_start"] == 120.0
    assert spine[2]["master_end"] == 180.0
    assert spine[2]["authoritative_video_id"] == 2
    assert spine[2]["cut_video"] == "v1"
