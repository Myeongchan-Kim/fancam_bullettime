import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Video

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def migrate_shorts():
    print("🚀 기존 영상들 중 쇼츠 판별 및 업데이트 시작...")
    
    # URL에 shorts가 있거나 길이가 65초 미만인 영상들 조회
    target_videos = db.query(Video).filter(
        (Video.url.like('%/shorts/%')) | 
        ((Video.duration > 0) & (Video.duration < 65))
    ).all()
    
    print(f"🔍 업데이트 대상: {len(target_videos)}개 발견")
    
    updated_count = 0
    for video in target_videos:
        if not video.is_shorts:
            video.is_shorts = True
            updated_count += 1
            print(f"✅ Shorts Tagged: {video.title[:40]}...")

    db.commit()
    print(f"\n✨ 작업 완료! 총 {updated_count}개의 영상을 쇼츠로 업데이트했습니다.")

if __name__ == "__main__":
    migrate_shorts()
    db.close()
