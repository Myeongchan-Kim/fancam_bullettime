import sys
import os
import time
import argparse
import logging
from sqlalchemy import or_, func

# 프로젝트 루트 path 추가
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from app.db import SessionLocal
from app.models.models import Video, Song, Concert, ConcertSetlist, Contribution
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

def audit_and_heal_videos_with_vision(
    limit: int = 100,
    max_manual_edits: int = 0,
    dry_run: bool = False,
    delay_sec: float = 1.5
):
    """
    수동으로 타임스탬프를 수정한 적이 없는(수정 횟수 <= max_manual_edits) 비디오들만 안전하게 필터링하여
    Gemini Multimodal Vision으로 곡과 타임라인 오프셋을 자동 치유합니다.
    """
    db = SessionLocal()
    try:
        all_songs = db.query(Song).all()

        # 1. 🛡️ 수동 보정된 비디오 ID 식별 (보호 대상)
        # sync_offset 제안이 승인/처리된 횟수가 max_manual_edits 초과인 비디오 제외
        manually_edited_records = db.query(
            Contribution.video_id,
            func.count(Contribution.id).label("edit_count")
        ).filter(
            Contribution.video_id.isnot(None),
            Contribution.suggested_sync_offset.isnot(None),
            Contribution.is_processed == True
        ).group_by(Contribution.video_id).having(func.count(Contribution.id) > max_manual_edits).all()

        protected_video_ids = {r[0] for r in manually_edited_records}
        logger.info(f"🛡️ [수동 보정 보호] 총 {len(protected_video_ids)}개 비디오는 수동 수정 이력이 있어 보존합니다.")

        # 2. 치유 대상 비디오 선별:
        # 보호 대상이 아니면서, 곡이 없거나 / sync_offset이 0이거나 / 제목이 모호한 비디오 우선
        query = db.query(Video).filter(
            ~Video.id.in_(protected_video_ids) if protected_video_ids else True,
            or_(
                ~Video.songs.any(),
                Video.sync_offset == 0.0,
                Video.title.ilike("%THIS IS FOR%"),
                Video.title.ilike("%Fancam%"),
                Video.title.ilike("%직캠%")
            )
        ).order_by(Video.id.asc())

        target_videos = query.limit(limit).all() if limit > 0 else query.all()

        logger.info(f"🔍 총 {len(target_videos)}개의 대상 비디오를 시각적(Visual Vision)으로 분석 및 치유합니다...\n")

        healed_count = 0
        skipped_count = 0

        for idx, video in enumerate(target_videos, 1):
            logger.info(f"[{idx}/{len(target_videos)}] 🎬 ID={video.id} | YT={video.youtube_id} | Title='{video.title}'")

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

            logger.info(f"   📸 [Gemini Vision] Act: {detected_act} | Song: {identified_song_name} | 신뢰도: {confidence:.2f}")
            logger.info(f"   👗 [근거]: {reasoning[:120]}...")

            if not identified_song_name or identified_song_name.upper() in ["UNKNOWN", "NONE"]:
                logger.warning("   ⚠️ 시각 판별 불가 -> 건너뜀")
                skipped_count += 1
                time.sleep(delay_sec)
                continue

            matched_song = match_song(identified_song_name, all_songs)
            if not matched_song:
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
                            logger.info(f"   🕒 [Sync Offset 치유] {old_offset}s -> {video.sync_offset}s")

                    db.commit()
                healed_count += 1
            else:
                logger.warning(f"   ⚠️ 곡 DB 매칭 실패: '{identified_song_name}'")
                skipped_count += 1

            time.sleep(delay_sec)

        logger.info(f"\n🎉 [완료] 치유 완료: {healed_count}개 | 보존/스킵: {skipped_count}개 | 총 분석: {len(target_videos)}개")

    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="수동 수정 영상 보호 기반 Gemini 시각적 곡 & 타임라인 치유기")
    parser.add_argument("--limit", type=int, default=100, help="처리할 최대 비디오 수 (0이면 전체)")
    parser.add_argument("--max-edits", type=int, default=0, help="보호할 수동 수정 횟수 기준 (기본 0: 1번이라도 수정된 건 보존)")
    parser.add_argument("--dry-run", action="store_true", help="DB 저장 없이 시뮬레이션만 수행")
    parser.add_argument("--delay", type=float, default=1.2, help="API 호출 간 대기 시간 (초)")
    args = parser.parse_args()

    audit_and_heal_videos_with_vision(
        limit=args.limit,
        max_manual_edits=args.max_edits,
        dry_run=args.dry_run,
        delay_sec=args.delay
    )
