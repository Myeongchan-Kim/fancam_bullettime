import sys
import os
import json
import time

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, Song, ConcertSetlist
from app.crawler.ai_parser import parse_fancam_metadata # 기존 AI 파서 활용

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def ai_tag_videos():
    print("🚀 Gemini AI 기반 노래 태깅 시작 (403개 대상)...")
    
    # 1. 노래 태그가 없는 영상들 가져오기
    no_song_videos = db.query(Video).filter(
        ~Video.songs.any(),
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).limit(30).all() 
    
    if not no_song_videos:
        print("✅ 노래 태그가 필요한 영상이 더 이상 없습니다.")
        return

    updated_count = 0

    for video in no_song_videos:
        try:
            # AI 파서 호출 (설명은 생략하고 제목만으로 분석)
            res = parse_fancam_metadata(video.title, "Unknown Channel")
            
            if res and res.get('songs'):
                suggested_songs = res['songs']
                
                # DB 업데이트
                added_for_this_video = 0
                for s_name in suggested_songs:
                    # 대소문자 구분 없이 검색
                    song = db.query(Song).filter(Song.name.ilike(s_name)).first()
                    if song and song not in video.songs:
                        video.songs.append(song)
                        added_for_this_video += 1
                        print(f"✅ [{video.id}] {video.title[:30]}... -> Tagged: {song.name}")
                
                if added_for_this_video > 0:
                    updated_count += 1
            
            time.sleep(1) # API 매너
        except Exception as e:
            print(f"❌ Error parsing {video.id}: {e}")

    db.commit()
    print(f"\n✨ 이번 회차에서 {updated_count}개의 영상에 노래 태그가 추가되었습니다.")

if __name__ == "__main__":
    ai_tag_videos()
    db.close()
