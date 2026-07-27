import sys
import os
import time
import asyncio
import logging

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import text
from app.core.config import settings
from app.models.models import Video, Song
from app.crawler.ai_parser import parse_fancam_metadata_async # 비동기 파서 활용
from app.db import SessionLocal

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

async def fix_video_tags(db, video, song_map):
    """
    개별 영상의 태그를 AI를 통해 재검증하고 수정합니다.
    """
    try:
        logger.info(f"🔍 [{video.id}] 분석 중: {video.title}")
        
        # AI 파서 호출 (채널 정보는 없으므로 Unknown)
        res = await parse_fancam_metadata_async(video.title, "Unknown Channel")
        
        if res is None:
            logger.warning(f"  ⚠️ AI 분석 실패: {video.id}")
            return False

        suggested_song_names = res.get('songs', [])
        
        # AI가 찾아낸 노래 객체 리스트 생성
        ai_songs = []
        for s_name in suggested_song_names:
            song_obj = song_map.get(s_name.lower())
            if song_obj:
                ai_songs.append(song_obj)
        
        # 현재 태그와 AI 권장 태그 비교
        current_song_ids = sorted([s.id for s in video.songs])
        ai_song_ids = sorted([s.id for s in ai_songs])
        
        if current_song_ids != ai_song_ids:
            logger.info(f"  ♻️ 태그 변경 감지: {current_song_ids} -> {ai_song_ids}")
            
            # "THIS IS FOR" (ID: 1) 오태깅 집중 해결을 위한 로그
            if 1 in current_song_ids and 1 not in ai_song_ids:
                logger.info(f"  🚨 [FIX] 'THIS IS FOR' (Tour Name) 오태깅 제거됨")
            
            # 태그 업데이트
            video.songs = ai_songs
            
            # 레거시 song_id 필드 업데이트
            video.song_id = ai_song_ids[0] if ai_song_ids else None
            return True
        else:
            logger.info(f"  ✅ 기존 태그 유지")
            return False

    except Exception as e:
        logger.error(f"  ❌ [{video.id}] 처리 중 에러: {e}")
        return False

async def run_fix_all_this_is_for():
    db = SessionLocal()
    
    # 1. 모든 노래 데이터 로드 (매핑용)
    all_songs = db.query(Song).all()
    song_map = {s.name.lower(): s for s in all_songs}
    
    # 2. "THIS IS FOR" (ID: 1)가 포함된 영상들 중 의심스러운 것들 먼저 타겟팅
    target_videos = db.query(Video).join(Video.songs).filter(Song.id == 1).all()
    
    logger.info(f"🚀 'THIS IS FOR' 태그가 붙은 {len(target_videos)}개 영상 재검증 시작...")

    updated_count = 0
    sleep_seconds = 5 # Gemini API 할당량 고려 (RPM 제한 방지)
    
    for idx, video in enumerate(target_videos):
        # 개별 처리 (순차적)
        is_fixed = await fix_video_tags(db, video, song_map)
        if is_fixed:
            updated_count += 1
            db.commit() # 매 수정마다 커밋하여 안정성 확보

        # 진행 상황 출력
        if (idx + 1) % 10 == 0:
            logger.info(f"📊 진행 상황: {idx + 1}/{len(target_videos)} 처리 완료... (수정됨: {updated_count})")
        
        # API Rate Limit 방지를 위해 강제 대기
        await asyncio.sleep(sleep_seconds)

    db.close()
    logger.info(f"✨ 최종 완료! {updated_count}개의 영상 태그가 수정되었습니다.")

if __name__ == "__main__":
    asyncio.run(run_fix_all_this_is_for())
