import sys
import os
import re
import logging
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models.models import Video, Concert
from app.main import SessionLocal

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def extract_date_from_title(title):
    """
    영상 제목에서 날짜 패턴을 추출하여 datetime 객체로 반환
    지원 형식: 20260322, 260322, 2026-03-22, 26.03.22 등
    """
    # 1. YYYYMMDD or YYMMDD (숫자만)
    match = re.search(r'\b(202[56])(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b', title)
    if match:
        return datetime.strptime(match.group(0), "%Y%m%d")
    
    match = re.search(r'\b(2[56])(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b', title)
    if match:
        return datetime.strptime(f"20{match.group(0)}", "%Y%m%d")

    # 2. YYYY-MM-DD or YY-MM-DD (구분자 포함)
    patterns = [
        r'(202[56])[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])',
        r'(2[56])[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])'
    ]
    
    for p in patterns:
        match = re.search(p, title)
        if match:
            g = match.groups()
            year = g[0] if len(g[0]) == 4 else f"20{g[0]}"
            return datetime.strptime(f"{year}{g[1]}{g[2]}", "%Y%m%d")
            
    return None

def run_date_fixer(dry_run=False):
    db = SessionLocal()
    try:
        videos = db.query(Video).all()
        logger.info(f"🔍 총 {len(videos)}개의 영상을 검사합니다... (Dry Run: {dry_run})")
        
        updated_count = 0
        for video in videos:
            extracted_date = extract_date_from_title(video.title)
            if not extracted_date:
                continue
                
            # 현재 연결된 콘서트의 날짜와 비교
            if video.concert and video.concert.date == extracted_date:
                continue
                
            # 날짜가 다르다면, 같은 도시 내에서 해당 날짜의 콘서트 검색
            if video.concert:
                correct_concert = db.query(Concert).filter(
                    Concert.city == video.concert.city,
                    Concert.date == extracted_date
                ).first()
                
                if correct_concert:
                    if correct_concert.id != video.concert_id:
                        logger.info(f"✅ 날짜 불일치 발견 [{video.id}]: {video.title}")
                        logger.info(f"   - 기존: {video.concert.city} ({video.concert.date.date()})")
                        logger.info(f"   - 변경: {correct_concert.city} ({correct_concert.date.date()})")
                        
                        if not dry_run:
                            video.concert_id = correct_concert.id
                        updated_count += 1
                else:
                    # 해당 도시에 해당 날짜 공연이 없는 경우 (다른 도시일 가능성)
                    logger.debug(f"⚠️ {video.concert.city}에 {extracted_date.date()} 공연 정보가 없습니다.")

        if not dry_run:
            db.commit()
            logger.info(f"✨ 업데이트 완료! 총 {updated_count}개의 영상 날짜를 교정했습니다.")
        else:
            logger.info(f"🧪 Dry Run 완료. 총 {updated_count}개의 대상이 발견되었습니다.")

    except Exception as e:
        logger.error(f"❌ 오류 발생: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    # --dry-run 인자가 있으면 실제 저장은 하지 않음
    is_dry = "--dry-run" in sys.argv
    run_date_fixer(dry_run=is_dry)
