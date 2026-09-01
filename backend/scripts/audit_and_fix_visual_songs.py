import sys
import os
import logging
from sqlalchemy import or_, func

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from app.db import SessionLocal
from app.models.models import Video, Song, Concert, ConcertSetlist
from app.crawler.visual_classifier import classify_fancam_visually

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def match_song(song_name: str, songs: list) -> Song:
    if not song_name:
        return None
    cleaned = song_name.lower().replace(" ", "").replace("'", "").replace("!", "").replace("?", "")
    for s in songs:
        s_cleaned = s.name.lower().replace(" ", "").replace("'", "").replace("!", "").replace("?", "")
        if cleaned == s_cleaned or cleaned in s_cleaned or s_cleaned in cleaned:
            return s
    return None

def audit_and_heal_videos_with_vision(limit: int = 50, dry_run: bool = False):
    db = SessionLocal()
    try:
        all_songs = db.query(Song).all()
        
        # 1. 시각적 판별이 가장 시급한 비디오 선별:
        # - 곡이 아예 없는 비디오
        # - 또는 sync_offset이 0이면서 직캠인 비디오
        # - 또는 제목에 곡명이 없이 모호한 비디오
        target_videos = db.query(Video).filter(
            or_(
                ~Video.songs.any(),
                Video.sync_offset == 0.0,
                Video.title.ilike("%THIS IS FOR%")
            )
        ).order_by(Video.id.asc()).limit(limit).all()

        logger.info(f"🔍 총 {len(target_videos)}개의 대상 비디오를 시각적(Visual Vision)으로 판별합니다...")
        
        healed_count = 0
        for idx, video in enumerate(target_videos, 1):
            logger.info(f"\n[{idx}/{len(target_videos)}] 🎬 비디오 분석: ID={video.id} | YT={video.youtube_id} | Title='{video.title}'")
            
            vision_result = classify_fancam_visually(
                youtube_id=video.youtube_id,
                title=video.title,
                description=video.description or ""
            )
            
            identified_song_name = vision_result.get("identified_song")
            detected_act = vision_result.get("detected_act")
            detected_members = vision_result.get("detected_members", [])
            confidence = vision_result.get("confidence", 0.0)
            reasoning = vision_result.get("reasoning", "")
            
            logger.info(f"   📸 [Gemini Vision 판별] Act: {detected_act} | Song: {identified_song_name} | Confidence: {confidence:.2f}")
            logger.info(f"   👗 [의상/근거]: {reasoning}")

            if not identified_song_name or identified_song_name.upper() in ["UNKNOWN", "NONE"]:
                logger.warning(f"   ⚠️ 시각 판별 불가, 건너뜁니다.")
                continue

            matched_song = match_song(identified_song_name, all_songs)
            if not matched_song:
                # candidate_songs에서 2차 시도
                for cand in vision_result.get("candidate_songs", []):
                    matched_song = match_song(cand, all_songs)
                    if matched_song:
                        break

            if matched_song:
                logger.info(f"   ✅ 매칭된 정규 곡: '{matched_song.name}' (ID: {matched_song.id})")
                if not dry_run:
                    video.songs = [matched_song]
                    video.song_id = matched_song.id
                    if detected_members and (not video.members or len(video.members) == 0):
                        video.members = detected_members

                    # 콘서트 세트리스트에서 시작 시간 찾아 sync_offset 치유
                    if video.concert_id:
                        setlist_item = db.query(ConcertSetlist).filter(
                            ConcertSetlist.concert_id == video.concert_id,
                            ConcertSetlist.song_id == matched_song.id
                        ).first()
                        if setlist_item and setlist_item.start_time is not None:
                            old_offset = video.sync_offset
                            video.sync_offset = setlist_item.start_time
                            logger.info(f"   🕒 [Sync Offset 치유] {old_offset}s -> {video.sync_offset}s (Concert Setlist Start)")
                    
                    db.commit()
                healed_count += 1
            else:
                logger.warning(f"   ⚠️ 곡 DB에서 '{identified_song_name}'를 찾을 수 없습니다.")

        logger.info(f"\n🎉 [완료] 총 {healed_count}/{len(target_videos)}개 비디오의 곡 및 타임라인 오프셋이 시각적으로 완벽히 치유되었습니다!")
    finally:
        db.close()

if __name__ == "__main__":
    audit_and_heal_videos_with_vision(limit=10, dry_run=False)
