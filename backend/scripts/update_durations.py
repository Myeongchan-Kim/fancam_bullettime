import os
import sys
import subprocess
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
from app.main import SessionLocal
from app.models.models import Video

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# 병렬 작업 수 (유튜브 차단을 피하기 위해 적정 수준 유지)
MAX_WORKERS = 10
DEFAULT_DURATION = 9999.0

def get_youtube_duration(video_info):
    """yt-dlp를 사용하여 유튜브 영상의 길이를 초 단위로 가져옴"""
    video_id, youtube_id, title = video_info
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    try:
        cmd = [
            "yt-dlp",
            "--quiet",
            "--no-warnings",
            "--no-interactive",
            "--print", "duration",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=15, stdin=subprocess.DEVNULL)
        duration_sec = float(result.stdout.strip())
        return video_id, duration_sec, title
    except Exception as e:
        logger.error(f"Failed to get duration for {youtube_id} ({title[:30]}): {e}")
        return video_id, None, title

def run_duration_checker():
    db = SessionLocal()
    
    # 이미 정보가 있는 경우(0이나 9999가 아닌 경우)는 스킵
    videos = db.query(Video.id, Video.youtube_id, Video.title).filter(
        (Video.duration == 0) | (Video.duration == None) | (Video.duration == DEFAULT_DURATION)
    ).all()
    
    if not videos:
        logger.info("모든 영상의 길이 정보가 이미 업데이트되어 있습니다.")
        db.close()
        return

    logger.info(f"🚀 총 {len(videos)}개의 영상에 대해 병렬 업데이트 시작 (Workers: {MAX_WORKERS})...")

    updated_count = 0
    
    # ThreadPool을 사용하여 병렬 처리
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_video = {executor.submit(get_youtube_duration, v): v for v in videos}
        
        for future in as_completed(future_to_video):
            video_id, duration, title = future.result()
            
            if duration:
                # DB 업데이트는 개별적으로 진행 (병렬 쓰기 방지를 위해 main thread에서 세션 사용)
                video_obj = db.query(Video).filter(Video.id == video_id).first()
                if video_obj:
                    video_obj.duration = duration
                    db.commit()
                    updated_count += 1
                    logger.info(f"✅ [{updated_count}/{len(videos)}] 업데이트 완료 ({duration}s): {title[:40]}...")
            else:
                logger.warning(f"⚠️ [{video_id}] 정보를 가져오지 못함: {title[:40]}...")

    db.close()
    logger.info(f"✨ 작업 완료! 총 {updated_count}개의 영상을 업데이트했습니다.")

if __name__ == "__main__":
    run_duration_checker()
