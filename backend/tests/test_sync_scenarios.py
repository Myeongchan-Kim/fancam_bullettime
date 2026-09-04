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
    Video 64 (Full Concert) offset: -237.0s
    Concert Time = 5522 + (-237.0) = 5285.0s
    
    Video 215 (Momo Solo) offset: 5277.0s
    Relative Time in Video 215 = 5285.0 - 5277.0 = 8.0s
    """
    db = SessionLocal()
    try:
        v64 = db.query(Video).filter(Video.id == 64).first()
        v215 = db.query(Video).filter(Video.id == 215).first()
        
        assert v64 is not None, "Video 64 not found"
        assert v215 is not None, "Video 215 not found"
        assert v64.concert_id == v215.concert_id, "Concert IDs do not match"
        
        # Verify offsets
        # If user is at v64 time 5522, concert time is 5285
        concert_time = 5522 + v64.sync_offset
        # v215 should have started by then
        assert concert_time >= v215.sync_offset, f"Video 215 has not started at concert time {concert_time}"
        # And should be within a reasonable duration (Momo solo is ~3min = 180s)
        # Using v215.duration if available, else a safe estimate
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

