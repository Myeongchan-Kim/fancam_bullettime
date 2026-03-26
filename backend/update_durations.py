import os
import sys
import subprocess
import json
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import SessionLocal
from app.models.models import Video

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def get_youtube_duration(youtube_id):
    """yt-dlp를 사용하여 유튜브 영상의 길이를 초 단위로 가져옴"""
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    try:
        # --get-duration은 "12:34" 형식을 주므로, --print duration_string 이나 JSON 추출이 안전함
        cmd = [
            "yt-dlp",
            "--quiet",
            "--no-warnings",
            "--print", "duration",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        duration_sec = float(result.stdout.strip())
        return duration_sec
    except Exception as e:
        logger.error(f"Failed to get duration for {youtube_id}: {e}")
        return None

def run_duration_checker():
    db = SessionLocal()
    
    # 길이가 0이거나 데이터가 없는 영상들 추출
    videos = db.query(Video).filter((Video.duration == 0) | (Video.duration == None)).all()
    
    if not videos:
        logger.info("모든 영상의 길이 정보가 이미 업데이트되어 있습니다.")
        return

    logger.info(f"🔍 총 {len(videos)}개의 영상에 대해 길이 정보를 확인합니다...")

    updated_count = 0
    for video in videos:
        logger.info(f"🔄 처리 중 [{video.id}]: {video.title}")
        
        duration = get_youtube_duration(video.youtube_id)
        
        if duration:
            video.duration = duration
            db.commit()
            updated_count += 1
            logger.info(f"✅ 업데이트 완료: {duration}초")
        else:
            logger.warning(f"⚠️ 길이 정보를 가져오지 못했습니다. 스킵합니다.")

    db.close()
    logger.info(f"✨ 작업 완료. 총 {updated_count}개의 영상을 업데이트했습니다.")

if __name__ == "__main__":
    run_duration_checker()
