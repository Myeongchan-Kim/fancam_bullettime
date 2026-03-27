import sys
import os
import json
import asyncio
from googleapiclient.discovery import build
from dotenv import load_dotenv

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Video

# .env 로드
dotenv_path = os.path.join(os.getcwd(), "backend", ".env")
load_dotenv(dotenv_path)

# 유튜브 API 설정
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def fetch_descriptions():
    print("🚀 마스터 영상(Full Concert) 설명문 수집 시작...")
    
    # 설명이 없는 Full-Concert 영상들 조회
    target_videos = db.query(Video).filter(
        (Video.angle == 'Full-Concert') | (Video.title.like('%Full Concert%')),
        (Video.description == None) | (Video.description == "")
    ).all()
    
    print(f"🔍 업데이트 대상: {len(target_videos)}개")
    
    # 50개씩 묶어서 유튜브 API 호출
    for i in range(0, len(target_videos), 50):
        chunk = target_videos[i:i+50]
        ids = [v.youtube_id for v in chunk]
        
        try:
            request = youtube.videos().list(
                part="snippet",
                id=",".join(ids)
            )
            response = request.execute()
            
            for item in response.get("items", []):
                y_id = item["id"]
                desc = item["snippet"]["description"]
                
                v = db.query(Video).filter(Video.youtube_id == y_id).first()
                if v:
                    v.description = desc
                    print(f"✅ Updated: {v.title[:30]}...")
            
            db.commit()
        except Exception as e:
            print(f"❌ API Error: {e}")

    print("\n✨ 설명문 수집 완료!")

if __name__ == "__main__":
    fetch_descriptions()
    db.close()
