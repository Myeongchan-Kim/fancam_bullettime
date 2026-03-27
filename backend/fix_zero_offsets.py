import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, ConcertSetlist, Song

# backend 폴더 내부에서 실행됨을 가정
DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def fix_zero_offsets():
    print("🚀 오프셋 0인 영상들 자동 보정 시작...")
    
    # 1. 오프셋이 0인 영상들 가져오기 (Full-Concert 제외)
    # Full-Concert는 진짜 0초부터 시작할 수도 있으므로 제외하거나 수동 확인이 안전함
    zero_offset_videos = db.query(Video).filter(
        Video.sync_offset == 0,
        Video.angle != 'Full-Concert',
        ~Video.title.like('%Full Concert%')
    ).all()
    
    print(f"🔍 보정 대상 영상: {len(zero_offset_videos)}개 발견")
    
    updated_count = 0
    skipped_count = 0

    for video in zero_offset_videos:
        if not video.concert_id:
            skipped_count += 1
            continue
            
        # 2. 영상에 태그된 곡들 중 첫 번째 곡 가져오기
        # relationship 'songs'를 사용하거나 video_song_association 테이블 조회
        song_id = None
        if video.songs:
            song_id = video.songs[0].id
        elif video.song_id: # 레거시 필드 체크
            song_id = video.song_id
            
        if not song_id:
            skipped_count += 1
            continue

        # 3. 해당 콘서트의 셋리스트에서 그 곡의 시작 시간(start_time) 찾기
        setlist_item = db.query(ConcertSetlist).filter(
            ConcertSetlist.concert_id == video.concert_id,
            ConcertSetlist.song_id == song_id
        ).first()
        
        if setlist_item and setlist_item.start_time > 0:
            # 4. 오프셋을 곡 시작 시간으로 업데이트
            video.sync_offset = float(setlist_item.start_time)
            updated_count += 1
            print(f"✅ [{video.concert.city if video.concert else '??'}] {video.title[:30]}... -> Offset: {video.sync_offset}s (Song: {setlist_item.song.name})")
        else:
            skipped_count += 1

    db.commit()
    print(f"\n✨ 작업 완료!")
    print(f"📊 총 {updated_count}개 영상의 오프셋을 보정했습니다. ({skipped_count}개 스킵)")

if __name__ == "__main__":
    fix_zero_offsets()
    db.close()
