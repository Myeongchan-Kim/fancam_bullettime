import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd()))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, Song, ConcertSetlist
from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def check_untagged():
    print("🔍 태그(Song)가 누락된 영상들을 검색 중입니다...\n")
    
    # 1. 연결된 노래가 없는 영상들 가져오기
    untagged_videos = db.query(Video).filter(~Video.songs.any()).all()
    
    # 2. 모든 노래 목록 가져오기 (매칭용)
    all_songs = db.query(Song).all()
    
    print(f"📊 총 {len(untagged_videos)}개의 영상에 태그가 없습니다.\n")
    
    matches_found = 0
    for video in untagged_videos:
        suggested_songs = []
        # 제목을 기준으로 간단한 매칭 시도
        title_upper = video.title.upper()
        for song in all_songs:
            song_name_upper = song.name.split(' (')[0].upper() # (Solo) 등 제외하고 매칭
            if len(song_name_upper) > 2 and song_name_upper in title_upper:
                suggested_songs.append(song.name)
        
        if suggested_songs:
            matches_found += 1
            print(f"🚩 [ID {video.id}] {video.title}")
            print(f"   💡 추천 태그: {', '.join(suggested_songs)}")
        else:
            print(f"⚠️  [ID {video.id}] {video.title}")
            print(f"   (추천할 수 있는 노래를 찾지 못했습니다)")
        print("-" * 50)

    print(f"\n✨ 분석 완료!")
    print(f"📈 매칭 후보를 찾은 영상: {matches_found} / {len(untagged_videos)}")
    print("💡 이 리스트를 바탕으로 ai_tag_videos.py 또는 수동 보정을 진행하세요.")

if __name__ == "__main__":
    check_untagged()
    db.close()
