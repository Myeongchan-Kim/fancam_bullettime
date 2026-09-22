import pytest
from unittest.mock import patch
from app.services.continuity_gate import evaluate_3point_continuity

@patch("app.services.continuity_gate.probe_acoustic_match")
def test_evaluate_3point_continuity_one_take(mock_probe):
    # Mock all 3 probes returning offset ~500.0s
    mock_probe.side_effect = [
        {"success": True, "relative_offset": 500.05, "confidence": 0.85},
        {"success": True, "relative_offset": 500.00, "confidence": 0.90},
        {"success": True, "relative_offset": 499.95, "confidence": 0.88},
    ]

    res = evaluate_3point_continuity(
        yt_tgt="tgt123",
        yt_ref="ref123",
        duration=180.0,
        expected_offset=500.0,
        tolerance=0.4
    )

    assert res["is_continuous"] is True
    assert res["verdict"] == "continuous_one_take"
    assert abs(res["mean_offset"] - 500.0) < 0.1
    assert res["recommended_split_window"] is None


@patch("app.services.continuity_gate.probe_acoustic_match")
def test_evaluate_3point_continuity_cut_in_second_half(mock_probe):
    # Start and Mid at ~500.0s, but End jumps to 550.0s (cut after mid)
    mock_probe.side_effect = [
        {"success": True, "relative_offset": 500.0, "confidence": 0.85},
        {"success": True, "relative_offset": 500.1, "confidence": 0.90},
        {"success": True, "relative_offset": 550.0, "confidence": 0.88},
    ]

    res = evaluate_3point_continuity(
        yt_tgt="tgt123",
        yt_ref="ref123",
        duration=200.0,
        expected_offset=500.0,
        tolerance=0.4
    )

    assert res["is_continuous"] is False
    assert res["verdict"] == "cut_in_second_half"
    assert res["recommended_split_window"] == (100.0, 200.0)


@patch("app.services.continuity_gate.probe_acoustic_match")
def test_evaluate_3point_continuity_cut_in_first_half(mock_probe):
    # Start at 450.0s, Mid and End at 500.0s (cut before mid)
    mock_probe.side_effect = [
        {"success": True, "relative_offset": 450.0, "confidence": 0.85},
        {"success": True, "relative_offset": 500.0, "confidence": 0.90},
        {"success": True, "relative_offset": 500.1, "confidence": 0.88},
    ]

    res = evaluate_3point_continuity(
        yt_tgt="tgt123",
        yt_ref="ref123",
        duration=200.0,
        expected_offset=500.0,
        tolerance=0.4
    )

    assert res["is_continuous"] is False
    assert res["verdict"] == "cut_in_first_half"
    assert res["recommended_split_window"] == (0.0, 100.0)


@patch("app.services.continuity_gate.probe_acoustic_match")
def test_evaluate_3point_continuity_multiple_cuts(mock_probe):
    mock_probe.side_effect = [
        {"success": True, "relative_offset": 100.0, "confidence": 0.85},
        {"success": True, "relative_offset": 200.0, "confidence": 0.90},
        {"success": True, "relative_offset": 300.0, "confidence": 0.88},
    ]

    res = evaluate_3point_continuity(
        yt_tgt="tgt123",
        yt_ref="ref123",
        duration=300.0,
        expected_offset=100.0,
        tolerance=0.4
    )

    assert res["is_continuous"] is False
    assert res["verdict"] == "multiple_cuts_or_medley"
    assert res["recommended_split_window"] == (0.0, 300.0)
