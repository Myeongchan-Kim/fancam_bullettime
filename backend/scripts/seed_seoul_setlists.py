import sys
import os

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db import SessionLocal
from app.models.models import Concert, ConcertSetlist

def seed_seoul_setlists():
    db = SessionLocal()
    try:
        print("🚀 서울 피날레 콘서트 셋리스트 복제 및 시딩 시작...")
        
        # 1. 셋리스트가 풍부한 기준 공연 찾기 (Belmont Park 또는 Bangkok 등 30개 이상인 곳)
        ref_concert = db.query(Concert).filter(Concert.city == "Belmont Park").first()
        if not ref_concert:
            # Fallback to any concert with >= 28 items
            for c in db.query(Concert).all():
                count = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == c.id).count()
                if count >= 28:
                    ref_concert = c
                    break

        if not ref_concert:
            print("❌ 기준이 될 만한 셋리스트 정보를 찾지 못했습니다.")
            return

        ref_items = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == ref_concert.id).order_by(ConcertSetlist.display_order).all()
        print(f"📋 복제 기준 공연: {ref_concert.city} ({ref_concert.date}) - 총 {len(ref_items)}곡")

        # 2. 서울 피날레 공연들 찾기 (2026-07-10, 2026-07-11, 2026-07-12)
        seoul_concerts = db.query(Concert).filter(Concert.city == "Seoul").all()
        if not seoul_concerts:
            print("❌ DB에서 서울 피날레 공연 정보를 찾지 못했습니다.")
            return

        for concert in seoul_concerts:
            # 이미 셋리스트가 존재하는지 확인
            existing_count = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert.id).count()
            if existing_count > 0:
                print(f"⏩ {concert.city} ({concert.date}) 공연은 이미 {existing_count}개의 셋리스트가 존재하여 스킵합니다.")
                continue

            print(f"📝 {concert.city} ({concert.date}) 공연에 셋리스트 복제 적용 중...")
            for item in ref_items:
                new_item = ConcertSetlist(
                    concert_id=concert.id,
                    song_id=item.song_id,
                    event_name=item.event_name,
                    start_time=item.start_time,
                    display_order=item.display_order
                )
                db.add(new_item)
            
            print(f"   ✅ {concert.city} ({concert.date}) 공연에 {len(ref_items)}개 셋리스트 시딩 성공!")

        db.commit()
        print("\n✨ 서울 피날레 셋리스트 복구 작업이 완전히 성공했습니다!")

    except Exception as e:
        db.rollback()
        print(f"❌ 오류 발생: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_seoul_setlists()
