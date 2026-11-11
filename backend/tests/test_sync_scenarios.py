import pytest
import sys
import os
import dotenv

# Load .env
dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db import SessionLocal
from app.models.models import Video

def test_sync_case_incheon_day1_momo_solo():
    """
    Test Case: http://localhost:5173/video/64?t=5522
    Should show video/215.
    
    Calculation:
    Video 64 (Full Concert) offset: 0.0s (Master)
    Video 64 at playback time 5522.0s
    Concert Time = 5522.0 + v64.sync_offset = 5522.0s
    
    Video 215 (Momo Solo) offset: 5500.0s, duration: 111.0s
    Relative Time in Video 215 = 5522.0 - 5500.0 = 22.0s
    """
    db = SessionLocal()
    try:
        v64 = db.query(Video).filter(Video.id == 64).first()
        v215 = db.query(Video).filter(Video.id == 215).first()
        
        assert v64 is not None, "Video 64 not found"
        assert v215 is not None, "Video 215 not found"
        assert v64.concert_id == v215.concert_id, "Concert IDs do not match"
        
        # At video 64 playback time 5522s, Momo solo is actively playing
        concert_time = 5522.0 + v64.sync_offset
        assert concert_time >= v215.sync_offset, f"Video 215 has not started at concert time {concert_time}"
        duration = v215.duration if v215.duration > 0 else 180
        assert concert_time < v215.sync_offset + duration, f"Video 215 has already ended at concert time {concert_time}"
    finally:
        db.close()

def test_sync_case_momo_solo_multi_angle():
    """
    Test Case: http://localhost:5173/video/215?t=30
    Should show video/1136.
    
    Calculation:
    Video 215 offset: 5277.0s
    Concert Time = 30 + 5277.0 = 5307.0s
    
    Video 1136 offset: 5306.0s
    Relative Time in Video 1136 = 5307.0 - 5306.0 = 1.0s
    """
    db = SessionLocal()
    try:
        v215 = db.query(Video).filter(Video.id == 215).first()
        v1136 = db.query(Video).filter(Video.id == 1136).first()
        
        assert v215 is not None, "Video 215 not found"
        assert v1136 is not None, "Video 1136 not found"
        assert v215.concert_id == v1136.concert_id, "Concert IDs do not match"
        
        concert_time = 30 + v215.sync_offset
        # v1136 should be active at this concert time
        assert concert_time >= v1136.sync_offset, f"Video 1136 has not started at concert time {concert_time}"
        
        duration = v1136.duration if v1136.duration > 0 else 180
        assert concert_time < v1136.sync_offset + duration, f"Video 1136 has already ended at concert time {concert_time}"
    finally:
        db.close()

def test_sync_case_incheon_day2_part5_1715():
    """
    Regression Test Case: Video 1715 ([4K] TWICE【THIS IS FOR IN INCHEON DAY 2】PART 5)
    Should be synced to the concert finale/encore section (~8597s), NOT at 0.0s (beginning).
    """
    db = SessionLocal()
    try:
        v1715 = db.query(Video).filter(Video.id == 1715).first()
        assert v1715 is not None, "Video 1715 not found"
        assert v1715.sync_offset >= 8000.0, f"Video 1715 sync_offset {v1715.sync_offset} is too early (must be ~8597s)"
        assert v1715.calibration_count >= 1, "Video 1715 should have at least 1 calibration record"
        assert v1715.calibration_status == "ai_calibrated", "Video 1715 should be marked ai_calibrated"
    finally:
        db.close()

def test_sync_case_chaeyoung_gone_654():
    """
    Regression Test Case: Video 654 (Chaeyoung 'Gone' Fancam)
    Should be attached to 'Gone' (start_time ~2200s), NOT falsely attached to tour title 'THIS IS FOR' (219.5s).
    """
    db = SessionLocal()
    try:
        v654 = db.query(Video).filter(Video.id == 654).first()
        assert v654 is not None, "Video 654 not found"
        assert v654.sync_offset >= 2100.0, f"Video 654 sync_offset {v654.sync_offset} is falsely attached to concert start (must be ~2200s)"
        assert any("Gone" in s.name for s in v654.songs), f"Video 654 should be associated with song 'Gone', found {[s.name for s in v654.songs]}"
        assert v654.calibration_count >= 1, "Video 654 should have at least 1 calibration record"
    finally:
        db.close()

def test_sync_case_chaeyoung_dat_ahh_1161():
    """
    Regression Test Case: Video 1161 (Chaeyoung 'DAT AHH DAT OOH' Fancam)
    Should be attached to 'DAT AHH DAT OOH' (start_time ~5164s), NOT tour title 'THIS IS FOR' (219.5s).
    """
    db = SessionLocal()
    try:
        v1161 = db.query(Video).filter(Video.id == 1161).first()
        assert v1161 is not None, "Video 1161 not found"
        assert v1161.sync_offset >= 5000.0, f"Video 1161 sync_offset {v1161.sync_offset} is falsely attached to concert start (must be ~5164s)"
        assert any("DAT AHH" in s.name for s in v1161.songs), f"Video 1161 should be associated with 'DAT AHH DAT OOH', found {[s.name for s in v1161.songs]}"
        assert v1161.calibration_count >= 1, "Video 1161 should have at least 1 calibration record"
    finally:
        db.close()

def test_sync_case_momo_this_is_for_73():
    """
    Regression Test Case: Video 73 (Momo 'THIS IS FOR' Fancam)
    Should be accurately synced using 2-Stage Visual + Audio to ~243.1s (verse 1 entry),
    NOT trapped in repetitive audio local peaks (219.5s / 223.3s).
    """
    db = SessionLocal()
    try:
        v73 = db.query(Video).filter(Video.id == 73).first()
        assert v73 is not None, "Video 73 not found"
        assert 240.0 <= v73.sync_offset <= 248.0, f"Video 73 sync_offset {v73.sync_offset} is not locked at verse 1 (~243-246s)"
        assert v73.calibration_count >= 1, "Video 73 should have at least 1 calibration record"
    finally:
        db.close()

def test_sync_case_medley_opening_1681():
    """
    Regression Test Case: Video 1681 (Multi-song medley: THIS IS FOR + Strategy + SET ME FREE + I CAN'T STOP ME)
    Should be anchored to opening THIS IS FOR (~242.7s), verified across continuous multi-song probes.
    """
    db = SessionLocal()
    try:
        v1681 = db.query(Video).filter(Video.id == 1681).first()
        assert v1681 is not None, "Video 1681 not found"
        assert 240.0 <= v1681.sync_offset <= 246.0, f"Video 1681 sync_offset {v1681.sync_offset} should be ~242.7s"
        assert v1681.calibration_count >= 1, "Video 1681 should have at least 1 calibration record"
    finally:
        db.close()

def test_sync_case_intro_four_1714():
    """
    Regression Test Case: Video 1714 (Intro FOUR + THIS IS FOR + STRATEGY)
    Begins at concert VCR/Intro FOUR (t=0s), automatically split into segments by precision sync.
    """
    db = SessionLocal()
    try:
        v1714 = db.query(Video).filter(Video.id == 1714).first()
        assert v1714 is not None, "Video 1714 not found"
        assert v1714.sync_segments is not None and len(v1714.sync_segments) >= 2, "Video 1714 should have split segments"
        assert v1714.calibration_count >= 1, "Video 1714 should have at least 1 calibration record"
    finally:
        db.close()

def test_master_timeline_drifts_audit():
    """
    Test Case: Cross-Master Timeline Drift Audit for Concert 2.
    Ensures that differences between cut full concerts (e.g. #63) and unedited full concerts (e.g. #1094)
    are automatically detected and reported.
    """
    from app.services.calibration import audit_master_timeline_drifts
    db = SessionLocal()
    try:
        report = audit_master_timeline_drifts(db, concert_id=2)
        assert report["status"] == "success", "Drift audit should succeed"
        assert len(report["comparisons"]) >= 1, "Should find at least 1 comparison against reference master"
        
        # Check cut detection on #63
        comp63 = [c for c in report["comparisons"] if c["compared_video_id"] == 63]
        if comp63:
            assert comp63[0]["has_cut_detected"] is True, "Cut full concert #63 should be flagged as has_cut_detected"
            assert comp63[0]["duration_difference_seconds"] > 2000, "Should detect >2000s duration cut in #63"
    finally:
        db.close()

def test_group_63_locked_offset_preservation():
    """
    Test Case: Locked Group Hierarchy for #63 (Sub-Master MARS Cluster).
    Ensures child videos (#1181, #1676, #36) are strictly attached to #63 or its descendants
    and preserve their relative_offset.
    """
    db = SessionLocal()
    try:
        v63 = db.query(Video).filter(Video.id == 63).first()
        v1181 = db.query(Video).filter(Video.id == 1181).first()
        v36 = db.query(Video).filter(Video.id == 36).first()
        v1676 = db.query(Video).filter(Video.id == 1676).first()

        assert v63 is not None and v1181 is not None and v36 is not None and v1676 is not None
        assert v1181.parent_video_id == 63, "Video 1181 should have parent_video_id == 63"
        assert v1676.parent_video_id == 63, "Video 1676 should have parent_video_id == 63"
        assert v36.parent_video_id == 1181, "Video 36 should be child of 1181"
        assert v36.relative_offset is not None, "Video 36 should have relative_offset preserved"
    finally:
        db.close()







def test_sync_case_split_segments_continuity_1714():
    """
    Test Case: Video #1714 split segments must form a continuous cover
    from 0.0s to duration without timeline holes or negative gaps.
    """
    from app.models.models import VideoSyncSegment
    db = SessionLocal()
    try:
        v1714 = db.query(Video).filter(Video.id == 1714).first()
        assert v1714 is not None, "Video 1714 should exist"
        
        segments = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == 1714
        ).order_by(VideoSyncSegment.video_start_time.asc()).all()

        assert len(segments) >= 2, "Video 1714 should have multiple split segments"

        # Check coverage from 0 to duration
        assert segments[0].video_start_time == 0.0, "First segment must start at 0.0s"
        assert segments[-1].video_end_time >= v1714.duration - 1.0, "Last segment must reach end of video"

        # Check segment-to-segment continuity
        for i in range(len(segments) - 1):
            curr_seg = segments[i]
            next_seg = segments[i + 1]
            assert curr_seg.video_end_time == next_seg.video_start_time, (
                f"Segment gap detected between seg {curr_seg.id} and {next_seg.id}"
            )
    finally:
        db.close()

def test_sync_case_video_43_corrected_duration():
    """
    Test Case: Video #43 duration anomaly fix.
    Ensures #43 is not 9999.0s and is calibrated around Chaeyoung solo IN MY ROOM (5622.65s).
    """
    db = SessionLocal()
    try:
        v43 = db.query(Video).filter(Video.id == 43).first()
        assert v43 is not None, "Video 43 should exist"
        assert v43.duration < 300.0, f"Video 43 duration should be under 300s, got {v43.duration}"
        assert abs(v43.sync_offset - 5622.65) < 10.0, (
            f"Video 43 offset should be calibrated around 5622.65s, got {v43.sync_offset}"
        )
    finally:
        db.close()


def test_sync_case_video_1661_corrected_duration():
    """
    Test Case: Video #1661 duration anomaly fix.
    Ensures #1661 (Chaeyoung IN MY ROOM fancam) is 95.0s and not the 9999.0s placeholder.
    """
    db = SessionLocal()
    try:
        v1661 = db.query(Video).filter(Video.id == 1661).first()
        if v1661:
            assert v1661.duration == 95.0, f"Video 1661 duration should be 95.0s, got {v1661.duration}"
            assert v1661.duration < 300.0
    finally:
        db.close()


def test_stage1b_rough_offset_multi_song_and_typo_and_part1():
    """
    Test Case: Stage 1B Metadata / Setlist Rough Offset Estimation on 0720 (Concert 2).
    Verifies:
    1. Multi-song title ordering by earliest appearance in title (#1714 'FOUR, THIS IS FOR, Strategy' -> <= 5.0s, not Strategy 384s).
    2. Tour-title disambiguation in explicit multi-song lists (#1681 'THIS IS FOR+Strategy+SET ME FREE+I CAN'T STOP ME' -> ~220s, not I CAN'T STOP ME 957s).
    3. Fuzzy typo matching (#1640 'DAT AHH DAH OOH' -> ~5160s, not BATTITUDE 5323s).
    4. PART 1 opening detection (#1713 'PART 1' -> <= 5.0s, not 220s).
    """
    from app.services.calibration import estimate_video_rough_offset
    db = SessionLocal()
    try:
        v1714 = db.query(Video).filter(Video.id == 1714).first()
        v1681 = db.query(Video).filter(Video.id == 1681).first()
        v1640 = db.query(Video).filter(Video.id == 1640).first()
        v1713 = db.query(Video).filter(Video.id == 1713).first()

        assert v1714 and v1681 and v1640 and v1713

        est_1714, _, _ = estimate_video_rough_offset(db, v1714)
        assert est_1714 is not None and -5.0 <= est_1714 <= 5.0, (
            f"#1714 rough offset should anchor to FOUR (~0s), got {est_1714}"
        )

        est_1681, _, _ = estimate_video_rough_offset(db, v1681)
        assert est_1681 is not None and 210.0 <= est_1681 <= 230.0, (
            f"#1681 rough offset should anchor to THIS IS FOR (~220s), got {est_1681}"
        )

        est_1640, _, _ = estimate_video_rough_offset(db, v1640)
        assert est_1640 is not None and 5150.0 <= est_1640 <= 5175.0, (
            f"#1640 rough offset should fuzzy-match DAT AHH DAT OOH (~5160s), got {est_1640}"
        )

        est_1713, _, _ = estimate_video_rough_offset(db, v1713)
        assert est_1713 is not None and -5.0 <= est_1713 <= 5.0, (
            f"#1713 PART 1 rough offset should anchor to opening (~0s), got {est_1713}"
        )
    finally:
        db.close()


def test_100bpm_beat_aliasing_prevention_and_1s_guardrail(tmp_path):
    """
    Test Case: 100 BPM periodic beat aliasing prevention via 1-second Harmonic+Chroma Pyramid
    followed by a strict <= 1.0s fine raw-audio alignment guardrail.
    """
    import numpy as np
    from scipy.io import wavfile
    from app.services.audio_dsp import (
        match_harmonic_pyramid_1s_and_fine_align,
        fine_align_within_1s,
    )

    sr = 16000
    dur_ref = 30.0
    t_ref = np.arange(int(dur_ref * sr)) / sr

    # Construct a 100 BPM (0.6s beat, 2.4s 4-beat bar) signal with evolving harmonic chord progression
    beat_env = 0.5 + 0.5 * np.cos(2 * np.pi * (100.0 / 60.0) * t_ref) ** 8
    # Unique harmonic chord modulation over time so each 10s window has a distinct harmonic trajectory
    f1 = 220.0 + 110.0 * np.sin(2 * np.pi * t_ref / 17.0)
    f2 = 330.0 + 165.0 * np.cos(2 * np.pi * t_ref / 13.0)
    harmonic = 0.35 * np.sin(2 * np.pi * np.cumsum(f1) / sr) + 0.35 * np.sin(2 * np.pi * np.cumsum(f2) / sr)
    ref_sig = harmonic * beat_env

    # True offset = 10.35s (duration 10s)
    true_offset = 10.35
    start_idx = int(true_offset * sr)
    end_idx = start_idx + int(10.0 * sr)
    tgt_sig = ref_sig[start_idx:end_idx].copy()

    # Inject a loud 100-BPM phase-aligned percussive burst at +2.4s (12.75s) in ref_sig
    # to fool wide-window raw waveform correlation while preserving harmonic structure
    burst_start = int((true_offset + 2.4) * sr)
    burst_end = burst_start + int(10.0 * sr)
    ref_sig_corrupted = ref_sig.copy()
    ref_sig_corrupted[burst_start:burst_end] += 1.8 * beat_env[burst_start:burst_end] * np.sin(2 * np.pi * 80.0 * t_ref[burst_start:burst_end])

    # Normalize to int16 WAV
    ref_wav = str(tmp_path / "ref_100bpm.wav")
    tgt_wav = str(tmp_path / "tgt_100bpm.wav")
    wavfile.write(ref_wav, sr, np.clip(ref_sig_corrupted * 12000, -32767, 32767).astype(np.int16))
    wavfile.write(tgt_wav, sr, np.clip(tgt_sig * 12000, -32767, 32767).astype(np.int16))

    res = match_harmonic_pyramid_1s_and_fine_align(
        tgt_wav=tgt_wav,
        ref_wav=ref_wav,
        ref_window_start=0.0,
        max_fine_radius_s=1.0,
    )
    assert abs(res["pre_audio_1s_sec"] - round(true_offset)) <= 1.0, (
        f"1s pre-audio grid lock should be within 1s of {true_offset}, got {res['pre_audio_1s_sec']}"
    )
    assert abs(res["fine_sec"] - true_offset) <= 0.05, (
        f"Fine aligned offset should be within 0.05s of {true_offset}, got {res['fine_sec']}"
    )
    assert abs(res["fine_sec"] - res["pre_audio_subgrid_sec"]) <= 1.0, (
        "Fine audio shift must strictly obey the +-1.0s guardrail"
    )

