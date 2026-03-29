import sys
import os
import json
import time

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, Concert, ConcertSetlist, Song
from app.crawler.ai_parser import parse_fancam_metadata # 기존 AI 파서 활용

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def time_to_seconds(t_str):
    """HH:MM:SS 또는 MM:SS 를 초 단위로 변환 (견고한 예외 처리 추가)"""
    try:
        if not t_str or not isinstance(t_str, str):
            return 0
        parts = t_str.split(':')
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, AttributeError, IndexError):
        pass
    return 0

def find_setlist_item(db, concert_id, song_name, setlist_map=None):
    """
    콘서트 ID와 곡명으로 셋리스트 아이템을 찾는 로직.
    setlist_map이 있으면 DB 조회 없이 즉시 반환 (N+1 해결).
    """
    if setlist_map is not None:
        return setlist_map.get(song_name.lower())
    
    # 기존 방식 (Fallback)
    return db.query(ConcertSetlist).join(Song).filter(
        ConcertSetlist.concert_id == concert_id,
        Song.name.ilike(song_name)
    ).first()

def ai_fix_setlist_times():
    print("🚀 Gemini AI 기반 마스터 타임라인(셋리스트) 복구 시작...")
    
    # 1. 셋리스트 정보가 부족한 콘서트 찾기 (Full Concert 영상이 있는 콘서트 우선)
    target_concerts = db.query(Concert).join(Video).filter(
        (Video.angle == 'Full-Concert') | (Video.title.like('%Full Concert%')),
        Video.description.isnot(None),
        Video.description != ""
    ).distinct().all()
    
    print(f"🔍 타임라인 추출 대상 콘서트: {len(target_concerts)}개 발견")
    
    updated_concerts = 0

    for concert in target_concerts:
        # 해당 콘서트의 Full Concert 영상들 중 설명이 가장 긴 것 선택 (정보가 많을 확률 높음)
        master_video = db.query(Video).filter(
            Video.concert_id == concert.id,
            ((Video.angle == 'Full-Concert') | (Video.title.like('%Full Concert%')))
        ).order_by(text("length(description) DESC")).first()
        
        if not master_video or not master_video.description:
            continue
            
        print(f"🎬 Processing: {concert.city} (via {master_video.title[:30]}...)")
        
        try:
            # AI 파서 호출 (설명을 포함하여 셋리스트 추출 요청)
            res = parse_fancam_metadata(master_video.title, "Master Channel", master_video.description)
            
            if res and res.get('setlist'):
                found_timestamps = res['setlist']
                
                # 최적화: 해당 콘서트의 모든 셋리스트 아이템을 미리 가져옴 (N+1 방지)
                concert_setlist = db.query(ConcertSetlist).join(Song).filter(
                    ConcertSetlist.concert_id == concert.id
                ).all()
                setlist_map = {sl.song.name.lower(): sl for sl in concert_setlist if sl.song}

                updated_songs = 0
                for item in found_timestamps:
                    song_name = item.get('song_name')
                    timestamp = item.get('timestamp')
                    
                    if not song_name or not timestamp:
                        continue
                        
                    seconds = time_to_seconds(timestamp)
                    if seconds <= 0: continue
                    
                    # 최적화된 매칭 함수 사용
                    sl_item = find_setlist_item(db, concert.id, song_name, setlist_map)
                    
                    if sl_item:
                        sl_item.start_time = seconds
                        updated_songs += 1
                
                if updated_songs > 0:
                    updated_concerts += 1
                    print(f"✅ {concert.city}: {updated_songs}개 곡의 시작 시간 업데이트 완료")
            
            time.sleep(2) # Rate limit 대비
        except Exception as e:
            print(f"❌ Error processing {concert.city}: {e}")

    db.commit()
    print(f"\n✨ 총 {updated_concerts}개 콘서트의 타임라인을 복구했습니다.")

if __name__ == "__main__":
    ai_fix_setlist_times()
    db.close()
