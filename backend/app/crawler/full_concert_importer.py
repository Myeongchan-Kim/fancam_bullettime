import sys
import os
import json
import logging
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.models.models import Base, Video, Song, Concert, Contribution, ConcertSetlist
from app.crawler.step1_search import search_youtube, get_video_info, timestamp_to_seconds
from app.crawler.ai_parser import parse_fancam_metadata

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = "sqlite:///./twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
def run_full_concert_importer(city_name: str = None, limit: int = 5):
    db = SessionLocal()

    if city_name:
        cities = [city_name]
    else:
        # DB에서 셋리스트가 하나도 없는 도시 목록만 가져오기 (성능 최적화)
        # Concert 중에서 ConcertSetlist에 연결된 데이터가 없는 도시들만 필터링
        cities_query = db.query(Concert.city).filter(
            ~Concert.id.in_(db.query(ConcertSetlist.concert_id).distinct())
        ).distinct().all()

        cities = [c[0] for c in cities_query]
        logger.info(f"⚡ 셋리스트가 없는 {len(cities)}개 도시를 선별했습니다. 순차 처리를 시작합니다.")

    if not cities:
        logger.info("✅ 모든 도시의 셋리스트가 이미 등록되어 있습니다! 할 일이 없네요.")
        db.close()
        return

    for city in cities:
        # ... (이후 로직 동일)

        search_query = f"TWICE THIS IS FOR World Tour Full Concert {city}"
        logger.info(f"🔍 '{city}' 풀 콘서트 영상 검색 시작: {search_query}")
        
        try:
            video_urls = search_youtube(search_query, limit=limit)
            
            for url in video_urls:
                video_id = url.split("v=")[-1]
                
                # 이미 등록된 영상인지 확인 (Video)
                exists_v = db.query(Video).filter(Video.youtube_id == video_id).first()
                if exists_v:
                    logger.info(f"⏩ 이미 등록된 영상입니다: {video_id}")
                    continue

                # 영상 상세 정보 가져오기 (제목, 길이, 설명 포함)
                title, duration_sec, description, channel = get_video_info(url)
                if not title:
                    continue
                    
                logger.info(f"📺 영상 발견: {title} ({duration_sec}s)")

                # AI를 통해 날짜/도시/공연 정보 및 셋리스트 파악
                metadata = parse_fancam_metadata(title, channel, description)
                if not metadata:
                    continue
                
                c_date_str = metadata.get("date", "Unknown")
                c_city_meta = metadata.get("city", city)
                
                # 1. Concert 찾기 (도시명 유사도 검색)
                concert_query = db.query(Concert).filter(Concert.city.like(f"%{c_city_meta}%"))
                if c_date_str != "Unknown" and c_date_str:
                    try:
                        c_date = datetime.strptime(c_date_str, "%Y-%m-%d")
                        concert_query = concert_query.filter(Concert.date == c_date)
                    except:
                        pass
                
                concert_obj = concert_query.first()
                if not concert_obj:
                    # 메타데이터로 못 찾으면 원래 검색했던 도시로 다시 시도
                    concert_obj = db.query(Concert).filter(Concert.city.like(f"%{city}%")).first()
                    
                if not concert_obj:
                    logger.warning(f"⚠️ 해당하는 콘서트 정보를 DB에서 찾을 수 없습니다: {c_city_meta} ({c_date_str})")
                    continue

                # 2. 만약 AI가 셋리스트를 찾아냈다면, DB의 concert_setlists 업데이트
                ai_setlist = metadata.get("setlist", [])
                if ai_setlist:
                    if len(ai_setlist) >= 20: # 🛡️ 안전장치: 최소 20개 항목 이상일 때만 풀 콘서트로 인정
                        logger.info(f"📝 AI가 영상 설명에서 {len(ai_setlist)}개의 셋리스트 항목을 발견했습니다.")
                        existing_setlist_count = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_obj.id).count()
                        if existing_setlist_count == 0:
                            logger.info(f"⚙️ {concert_obj.city} 공연의 셋리스트를 자동 생성합니다.")
                            for idx, item in enumerate(ai_setlist):
                                s_name = item["song_name"]
                                s_ts = item["timestamp"]
                                s_sec = timestamp_to_seconds(s_ts)
                                song_obj = db.query(Song).filter(Song.name == s_name).first()
                                new_entry = ConcertSetlist(
                                    concert_id=concert_obj.id,
                                    song_id=song_obj.id if song_obj else None,
                                    event_name=s_name,
                                    start_time=s_sec,
                                    display_order=idx
                                )
                                db.add(new_entry)
                            db.commit()
                        else:
                            logger.info(f"ℹ️ 이미 {existing_setlist_count}개의 셋리스트가 존재하여 자동 생성은 건너뜁니다.")
                    else:
                        logger.warning(f"⚠️ 발견된 셋리스트 항목이 {len(ai_setlist)}개로 20개 미만입니다. 풀 콘서트로 인정하지 않습니다.")
                        ai_setlist = [] # 제보 생성 시에도 영향을 주지 않도록 초기화 (혹은 무시)
                # 3. 해당 콘서트의 노래 목록 가져오기 (제보용)
                setlist_entries = db.query(ConcertSetlist).filter(
                    ConcertSetlist.concert_id == concert_obj.id,
                    ConcertSetlist.song_id.isnot(None)
                ).all()
                
                all_song_ids = list(set(entry.song_id for entry in setlist_entries))

                # 4. Contribution 생성
                new_contrib = Contribution(
                    suggested_url=url,
                    suggested_title=title,
                    suggested_song_ids=json.dumps(all_song_ids),
                    suggested_concert_id=concert_obj.id,
                    suggested_members=json.dumps(["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"]),
                    suggested_duration=duration_sec,
                    suggested_angle="Full-Concert",
                    suggested_sync_offset=0.0,
                    user_ip="full-concert-importer-ai",
                    is_processed=0
                )
                
                db.add(new_contrib)
                db.commit()
                logger.info(f"✅ 제보 생성 완료: {title} (총 {len(all_song_ids)}곡 매칭됨)")
            
            # 한 도시 처리가 끝나면 휴식
            if len(cities) > 1:
                logger.info("💤 다음 도시를 위해 10초간 대기합니다...")
                time.sleep(10)

        except Exception as e:
            logger.error(f"❌ '{city}' 처리 중 오류 발생: {e}")
            continue

    db.close()

if __name__ == "__main__":
    target_city = sys.argv[1] if len(sys.argv) > 1 else None
    run_full_concert_importer(target_city)
