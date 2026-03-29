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

def tag_video_with_songs(video, suggested_songs, song_map=None):
    """
    영상에 노래 태그를 추가하는 핵심 로직.
    song_map이 제공되면 DB 조회 없이 맵에서 검색 (N+1 해결).
    """
    added_count = 0
    for s_name in suggested_songs:
        song = None
        if song_map is not None:
            song = song_map.get(s_name.lower())
        else:
            # 기존 방식 (Fallback)
            song = db.query(Song).filter(Song.name.ilike(s_name)).first()
            
        if song and song not in video.songs:
            video.songs.append(song)
            added_count += 1
            print(f"✅ [{video.id}] -> Tagged: {song.name}")
    return added_count

def ai_tag_videos():
    print("🚀 Gemini AI 기반 노래 태깅 시작...")
    
    no_song_videos = db.query(Video).filter(
        ~Video.songs.any(),
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).limit(30).all() 
    
    if not no_song_videos:
        print("✅ 노래 태그가 필요한 영상이 더 이상 없습니다.")
        return

    # 최적화: 모든 노래를 한 번에 가져와서 맵핑 (N+1 방지)
    all_songs = db.query(Song).all()
    song_map = {s.name.lower(): s for s in all_songs}

    updated_count = 0
    for video in no_song_videos:
        try:
            res = parse_fancam_metadata(video.title, "Unknown Channel")
            if res and res.get('songs'):
                added = tag_video_with_songs(video, res['songs'], song_map)
                if added > 0:
                    updated_count += 1
            time.sleep(1)
        except Exception as e:
            print(f"❌ Error parsing {video.id}: {e}")

    db.commit()
    print(f"\n✨ 이번 회차에서 {updated_count}개의 영상에 노래 태그가 추가되었습니다.")

if __name__ == "__main__":
    ai_tag_videos()
    db.close()
