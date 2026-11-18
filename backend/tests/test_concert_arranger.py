import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, Video, Concert, Song, ConcertSetlist
from app.services.concert_arranger import WholeConcertArranger, arrange_whole_concert

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed test concert
    concert = Concert(id=999, city="Seoul", country="Korea", venue="KSPO Dome")
    session.add(concert)

    # Seed test videos
    v_master = Video(
        id=101, concert_id=999, youtube_id="yt_master",
        title="Full Concert 4K Day 1", duration=7200.0,
        calibration_status="raw"
    )
    v_tier2 = Video(
        id=102, concert_id=999, youtube_id="yt_act_medley",
        title="Act 2 Medley Focus", duration=1200.0,
        calibration_status="raw"
    )
    v_tier3_clean = Video(
        id=103, concert_id=999, youtube_id="yt_clean_song",
        title="4K BATTITUDE Nayeon Fancam", duration=180.0,
        calibration_status="raw"
    )
    v_tier3_cut = Video(
        id=104, concert_id=999, youtube_id="yt_cut_song",
        title="BATTITUDE Cut Fancam", duration=180.0,
        calibration_status="raw"
    )
    session.add_all([v_master, v_tier2, v_tier3_clean, v_tier3_cut])
    session.commit()

    yield session
    session.close()


@patch("app.services.concert_arranger.calibrate_video_with_two_pass")
@patch("app.services.concert_arranger.estimate_video_rough_offset")
@patch("app.services.concert_arranger.evaluate_3point_continuity")
def test_arrange_whole_concert_pipeline(
    mock_gate,
    mock_estimate,
    mock_two_pass,
    db_session
):
    # Mock Two-Pass Calibrator for Tier 2 long video (#102)
    mock_two_pass.return_value = {"success": True, "segments": [{"start": 0, "end": 1200}]}

    # Mock Rough Offset estimation for Tier 3 videos
    mock_estimate.side_effect = lambda db, v: (5323.0, "Title matched BATTITUDE", None)

    # Mock Gate: #103 passes 1:1, #104 fails gate with cut
    def mock_gate_func(yt_tgt, yt_ref, duration, expected_offset, tolerance):
        if yt_tgt == "yt_clean_song":
            return {
                "is_continuous": True,
                "verdict": "continuous_one_take",
                "mean_offset": 5323.2,
                "recommended_split_window": None
            }
        else:
            return {
                "is_continuous": False,
                "verdict": "cut_in_second_half",
                "mean_offset": None,
                "recommended_split_window": (90.0, 180.0)
            }
    mock_gate.side_effect = mock_gate_func

    # Run Whole Concert Arranger (Dry Run)
    res = arrange_whole_concert(db_session, concert_id=999, dry_run=True)

    assert res["success"] is True
    stats = res["stats"]

    # Assertions
    assert stats["master_video_id"] == 101
    assert stats["total_videos"] == 4
    assert stats["tier_long_count"] == 1   # #102
    assert stats["tier_short_count"] == 2  # #103, #104

    assert stats["two_pass_split_processed"] == 1
    assert stats["gate_1to1_locked"] == 1
    assert stats["gate_cuts_diverted"] == 1
    assert stats["dry_run"] is True

    # In dry-run, DB should be rolled back
    v103 = db_session.query(Video).filter(Video.id == 103).first()
    assert v103.calibration_status == "raw"


def test_cascade_update_children_offsets_handles_parent_cycle(db_session):
    """
    Regression Test: Cyclic parent_video_id links (e.g. A -> B -> A) must NOT raise
    RecursionError during record_video_calibration / cascade_update_children_offsets,
    and each node must be updated at most once.
    """
    from app.services.calibration import record_video_calibration

    v_a = Video(
        id=201, concert_id=999, youtube_id="yt_cycle_a",
        title="Cycle Node A", duration=90.0,
        sync_offset=100.0, parent_video_id=202, calibration_status="ai_calibrated"
    )
    v_b = Video(
        id=202, concert_id=999, youtube_id="yt_cycle_b",
        title="Cycle Node B", duration=90.0,
        sync_offset=105.0, parent_video_id=201, calibration_status="ai_calibrated"
    )
    v_leaf = Video(
        id=203, concert_id=999, youtube_id="yt_cycle_leaf",
        title="Cycle Leaf C", duration=90.0,
        sync_offset=110.0, parent_video_id=202, calibration_status="ai_calibrated"
    )
    db_session.add_all([v_a, v_b, v_leaf])
    db_session.commit()

    # Move v_a by +10.0s -> v_b and v_leaf should each shift by +10.0s exactly once without RecursionError
    record_video_calibration(db_session, v_a, sync_offset=110.0, commit=True)

    db_session.refresh(v_a)
    db_session.refresh(v_b)
    db_session.refresh(v_leaf)
    assert v_a.sync_offset == 110.0
    assert v_b.sync_offset == 115.0
    assert v_leaf.sync_offset == 120.0


@patch("app.services.concert_arranger.estimate_video_rough_offset")
@patch("app.services.concert_arranger.evaluate_3point_continuity")
def test_arrange_whole_concert_skips_manual_calibrated_ground_truth(
    mock_gate,
    mock_estimate,
    db_session
):
    """
    Regression Test (Pass 0 Ground Truth Isolation):
    Videos with calibration_status == 'manual_calibrated' must be preserved and skipped
    by WholeConcertArranger just like 'manually_verified' videos.
    """
    v_gt_long = Video(
        id=301, concert_id=999, youtube_id="yt_gt_long",
        title="Manual GT Part 1", duration=2100.0,
        sync_offset=-9.1, calibration_status="manual_calibrated"
    )
    v_gt_short = Video(
        id=302, concert_id=999, youtube_id="yt_gt_short",
        title="Manual GT Solo", duration=91.0,
        sync_offset=5626.5, calibration_status="manual_calibrated"
    )
    db_session.add_all([v_gt_long, v_gt_short])
    db_session.commit()

    mock_estimate.return_value = (5323.0, "Mock", None)
    mock_gate.return_value = {
        "is_continuous": True,
        "verdict": "continuous_one_take",
        "mean_offset": 5323.0,
        "recommended_split_window": None
    }

    res = arrange_whole_concert(db_session, concert_id=999, dry_run=True)
    by_id = {r["video_id"]: r for r in res["video_results"]}

    assert by_id[301]["status"] == "manually_verified_skipped"
    assert by_id[301]["new_offset"] == -9.1
    assert by_id[302]["status"] == "manually_verified_skipped"
    assert by_id[302]["new_offset"] == 5626.5

