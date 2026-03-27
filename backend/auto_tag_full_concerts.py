import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, ConcertSetlist, Song

# Since we run this from within 'backend' folder
DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def auto_tag_full_concerts():
    print("🚀 7000초 이상 풀 콘서트 영상 자동 태깅 시작...")
    
    # 1. 대상 영상 찾기 (Full-Concert 앵글 + 7000초 이상)
    target_videos = db.query(Video).filter(
        (Video.angle == 'Full-Concert') | (Video.title.like('%Full Concert%')),
        Video.duration >= 7000
    ).all()
    
    print(f"🔍 분석 대상 영상: {len(target_videos)}개 발견")
    
    total_associations = 0
    updated_videos = 0

    for video in target_videos:
        if not video.concert_id:
            continue
            
        # 2. 해당 콘서트의 모든 노래 ID 가져오기
        setlist_songs = db.query(ConcertSetlist.song_id).filter(
            ConcertSetlist.concert_id == video.concert_id,
            ConcertSetlist.song_id.isnot(None)
        ).distinct().all()
        
        song_ids = [s[0] for s in setlist_songs]
        
        if not song_ids:
            # 만약 셋리스트 정보가 없으면 글로벌 셋리스트(1~37)라도 가져올지 고민했으나, 
            # 정확도를 위해 셋리스트가 있는 경우만 처리합니다.
            continue

        # 3. 매핑 데이터 삽입 (Raw SQL 사용이 중복 방지에 효율적)
        # sqlalchemy relationship으로 처리하면 이미 있는 경우 복잡해지므로 raw query 사용
        added_for_this_video = 0
        for s_id in song_ids:
            # 중복 체크 후 삽입
            check = db.execute(text("SELECT 1 FROM video_song_association WHERE video_id = :v_id AND song_id = :s_id"), 
                              {"v_id": video.id, "s_id": s_id}).first()
            if not check:
                db.execute(text("INSERT INTO video_song_association (video_id, song_id) VALUES (:v_id, :s_id)"),
                          {"v_id": video.id, "s_id": s_id})
                added_for_this_video += 1
        
        if added_for_this_video > 0:
            # 레거시 단일 song_id 필드도 첫 번째 곡으로 업데이트해줌 (호환성)
            video.song_id = song_ids[0]
            updated_videos += 1
            total_associations += added_for_this_video
            print(f"✅ {video.title[:40]}... -> {added_for_this_video}곡 태그 완료")

    db.commit()
    print(f"\n✨ 작업 완료!")
    print(f"📊 총 {updated_videos}개 영상에 {total_associations}개의 노래 태그가 추가되었습니다.")

if __name__ == "__main__":
    auto_tag_full_concerts()
    db.close()
