"""
Batch realignment and precision audio cross-correlation calibrator for Concert 2 (Incheon 2025-07-20).
"""
import os
import sys
import json
import logging
import datetime
import dotenv
from typing import List, Dict, Optional, Tuple

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv.load_dotenv(os.path.join(backend_dir, ".env"))
sys.path.insert(0, backend_dir)

from app.db import SessionLocal
from app.models.models import Video, Song, ConcertSetlist, VideoSyncSegment
from app.services.calibration import record_video_calibration
from scripts.precision_sync_calibrator import calibrate_video_3point

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("realign_0720")

def normalize_title(title: str) -> str:
    return title.upper().replace(" ", "").replace("_", "").replace("-", "")

def get_setlist_map(db, concert_id: int = 2) -> Dict[str, float]:
    """Returns mapping from song name / alternate names to expected start time in concert."""
    items = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).all()
    setlist_map = {}
    for it in items:
        s_name = it.song.name if it.song else (it.event_name or "")
        setlist_map[s_name.strip()] = it.start_time or 0.0
    return setlist_map

def step1_correct_songs_and_estimates(db, concert_id: int = 2):
    """Scan and correct song associations and expected offset estimates for Concert 2."""
    videos = db.query(Video).filter(Video.concert_id == concert_id, Video.is_unavailable == False).all()
    all_songs = db.query(Song).all()
    song_lookup = {s.name.strip(): s for s in all_songs}
    setlist_map = get_setlist_map(db, concert_id)

    logger.info(f"Loaded {len(videos)} videos and {len(all_songs)} songs for Concert {concert_id}")

    corrected_count = 0
    for v in videos:
        # Full concert cams or videos longer than 1 hour don't need song retagging
        if (v.duration or 0) > 3600:
            continue

        title_upper = v.title.upper()
        norm_title = normalize_title(v.title)
        
        # Match against song names in setlist (excluding generic 'THIS IS FOR' tour title when other songs exist)
        matched_songs = []
        for song_name, song_obj in song_lookup.items():
            if song_name == "THIS IS FOR":
                continue # handled separately below
            
            s_norm = normalize_title(song_name.replace("(Solo)", "").replace("(Encore)", "").replace("(Intro)", ""))
            if len(s_norm) >= 3 and s_norm in norm_title:
                matched_songs.append(song_obj)
            elif "YOU IN MY HEART" in title_upper or "널 내게 담아" in v.title:
                if song_name == "You In My Heart" and song_obj not in matched_songs:
                    matched_songs.append(song_obj)
            elif "ONE IN A MILLION" in title_upper:
                if "One In A Million" in song_name and song_obj not in matched_songs:
                    matched_songs.append(song_obj)
            elif "GIRLS LIKE US" in title_upper:
                if "GIRLS LIKE US" in song_name and song_obj not in matched_songs:
                    matched_songs.append(song_obj)
            elif "RANDOM DANCE" in title_upper:
                if "Random Dance" in song_name and song_obj not in matched_songs:
                    matched_songs.append(song_obj)
            elif "ROULETTE" in title_upper:
                if "Roulette" in song_name and song_obj not in matched_songs:
                    matched_songs.append(song_obj)

        # If no other song matched and title explicitly mentions THIS IS FOR without tour keywords
        if not matched_songs and "THIS IS FOR" in title_upper:
            # check if it's Part 1 / opening
            if "PART 1" in title_upper or "STRATEGY" in title_upper or "OPENING" in title_upper or "FOUR" in title_upper:
                this_is_for_song = song_lookup.get("THIS IS FOR")
                if this_is_for_song:
                    matched_songs.append(this_is_for_song)

        if matched_songs:
            current_song_ids = {s.id for s in v.songs}
            new_song_ids = {s.id for s in matched_songs}
            if current_song_ids != new_song_ids:
                logger.info(f"[SONG UPDATE] Video {v.id} ('{v.title[:40]}'): {[s.name for s in v.songs]} -> {[s.name for s in matched_songs]}")
                v.songs = matched_songs
                corrected_count += 1

    db.commit()
    logger.info(f"Step 1 Complete: Corrected song tags for {corrected_count} videos.")

def step2_realign_audio_cross_correlation(db, concert_id: int = 2, target_video_ids: Optional[List[int]] = None):
    """Run 3-point audio cross-correlation on target videos in Concert 2."""
    master = db.query(Video).filter(Video.id == 1094).first()
    if not master:
        master = db.query(Video).filter(Video.concert_id == concert_id, Video.duration > 7000).first()
    
    logger.info(f"Using Master Full Cam: Video {master.id} ('{master.title[:40]}', dur={master.duration}s)")
    setlist_map = get_setlist_map(db, concert_id)

    query = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.id != master.id,
        Video.is_unavailable == False
    )
    if target_video_ids:
        query = query.filter(Video.id.in_(target_video_ids))
        
    videos = query.order_by(Video.id.asc()).all()

    success_count = 0
    skipped_count = 0
    fail_count = 0

    for idx, v in enumerate(videos, 1):
        # Skip if full concert cam (> 1 hour)
        if (v.duration or 0) > 3600:
            logger.info(f"[{idx}/{len(videos)}] Video {v.id} is long full cam ({v.duration}s). Preserving offset {v.sync_offset}s.")
            skipped_count += 1
            continue

        # Determine expected master center
        expected_center = None
        if v.songs:
            first_song_name = v.songs[0].name
            if first_song_name in setlist_map:
                expected_center = setlist_map[first_song_name]
        
        # If no song in setlist, check current offset or title
        if expected_center is None:
            if v.sync_offset and v.sync_offset > 0:
                expected_center = v.sync_offset
            else:
                expected_center = 2000.0 # fallback

        logger.info(f"[{idx}/{len(videos)}] Calibrating Video {v.id} ('{v.title[:35]}', dur={v.duration}s, expected_center={expected_center}s)...")
        
        try:
            # Perform 3-point cross correlation with adaptive search radius
            radius = 600.0 if expected_center else 1200.0
            res = calibrate_video_3point(db, v, master, expected_master_center=expected_center, search_radius=radius)
            if res:
                success_count += 1
                logger.info(f"   ✅ Successfully aligned Video {v.id}: offset={v.sync_offset}s, count={v.calibration_count}")
            else:
                logger.warning(f"   ⚠️ Could not align Video {v.id} at expected_center={expected_center}s. Retrying wide search...")
                # Retry with wide search if needed
                res_wide = calibrate_video_3point(db, v, master, expected_master_center=expected_center, search_radius=1500.0)
                if res_wide:
                    success_count += 1
                    logger.info(f"   ✅ Successfully aligned Video {v.id} (wide search): offset={v.sync_offset}s")
                else:
                    fail_count += 1
        except Exception as e:
            logger.error(f"   ❌ Error calibrating Video {v.id}: {str(e)}")
            fail_count += 1

    logger.info(f"=== Re-alignment Finished ===")
    logger.info(f"Total: {len(videos)}, Success: {success_count}, Skipped (Long): {skipped_count}, Failed: {fail_count}")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        step1_correct_songs_and_estimates(db, concert_id=2)
        step2_realign_audio_cross_correlation(db, concert_id=2)
    finally:
        db.close()
