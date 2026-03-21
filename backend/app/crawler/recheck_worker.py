import os
import sys
import time
import logging
import traceback
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.models.models import Video, Concert, Contribution
from app.crawler.ai_parser import parse_fancam_metadata

DATABASE_URL = "sqlite:///./twice_fancam.db"

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Global state tracker
recheck_status = {
    "status": "Idle",
    "total_videos": 0,
    "processed_videos": 0,
    "contributions_created": 0,
    "error_message": None
}

def run_recheck_job():
    global recheck_status
    if recheck_status["status"] == "Running":
        logger.warning("Recheck job is already running.")
        return

    recheck_status["status"] = "Running"
    recheck_status["processed_videos"] = 0
    recheck_status["contributions_created"] = 0
    recheck_status["error_message"] = None

    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()

        # 'Other' 콘서트 정보 가져오기
        other_concert = db.query(Concert).filter(Concert.city == "Other").first()
        if not other_concert:
            raise Exception("데이터베이스에 'Other' 콘서트 정보가 없습니다. init_db.py를 실행했는지 확인해주세요.")

        # 이미 'Other'로 분류되어 있거나 알 수 없는 영상은 제외하고 검색
        videos = db.query(Video).filter(
            Video.concert_id != other_concert.id
        ).all()
        
        recheck_status["total_videos"] = len(videos)
        logger.info(f"🔍 기존 데이터 재검사 시작 (총 {len(videos)}개 대상)")

        for video in videos:
            if recheck_status["status"] != "Running":
                logger.info("Recheck job was stopped.")
                break
                
            recheck_status["processed_videos"] += 1
            
            # 이미 처리되지 않은 'Other' 제안이 있는지 확인
            existing_contrib = db.query(Contribution).filter(
                Contribution.video_id == video.id,
                Contribution.suggested_concert_id == other_concert.id,
                Contribution.is_processed == False
            ).first()

            if existing_contrib:
                logger.info(f"⏩ 스킵 [비디오 ID {video.id}]: 이미 'Other' 제안이 대기 중입니다.")
                continue

            logger.info(f"🔄 재분석 중 [비디오 ID {video.id}]: {video.title}")
            
            # AI에 제목만 던져서 다시 판별 (채널명은 DB에 없으므로 Unknown 처리)
            metadata = parse_fancam_metadata(video.title, channel_name="Unknown")
            
            if metadata and metadata.get("is_valid_fancam") and metadata.get("city") == "Other":
                logger.info(f"💡 AI 결과: [Other 영상 판독됨] 제안(Contribution)을 생성합니다.")
                new_contrib = Contribution(
                    video_id=video_id,
                    suggested_concert_id=other_concert.id,
                    suggested_song_ids=[], # Other 분류 시 노래 정보는 초기화 제안
                    user_ip="127.0.0.1" # 워커 IP
                )
                db.add(new_contrib)
                db.commit()
                recheck_status["contributions_created"] += 1
                logger.info(f"✅ 제안 생성 완료 [비디오 ID {video.id}]")
            else:
                logger.info(f"  판독 결과: 기존 콘서트 유지.")

            # API Rate limit 방지를 위해 3초 대기
            time.sleep(3)

        db.close()
        recheck_status["status"] = "Finished"
        logger.info("✨ 모든 기존 영상 재검사가 완료되었습니다.")

    except Exception as e:
        recheck_status["status"] = "Error"
        recheck_status["error_message"] = str(e)
        logger.error(f"❌ 재검사 워커 에러: {e}\n{traceback.format_exc()}")

if __name__ == "__main__":
    run_recheck_job()
