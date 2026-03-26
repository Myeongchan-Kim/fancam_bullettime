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
from app.crawler.step1_search import search_youtube, get_video_info, timestamp_to_seconds, get_video_id
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
        # DB에서 셋리스트가 하나도 없는 도시 목록만 가져오기
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
        search_query = f"TWICE THIS IS FOR World Tour Full Concert {city}"
        logger.info(f"🔍 '{city}' 풀 콘서트 영상 검색 시작: {search_query}")
        
        try:
            video_urls = search_youtube(search_query, limit=limit)
            
            for url in video_urls:
                v_id = get_video_id(url)
                if not v_id: continue
                
                # 1. 이미 등록된 영상인지 확인
                exists_v = db.query(Video).filter(Video.youtube_id == v_id).first()
                if exists_v:
                    # 이미 등록된 영상이라면, 그 영상이 속한 실제 공연의 셋리스트가 있는지 확인
                    if exists_v.concert_id:
                        actual_setlist_count = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == exists_v.concert_id).count()
                        if actual_setlist_count > 0:
                            logger.info(f"⏩ 영상({v_id})은 이미 등록되어 있고, 해당 공연의 셋리스트도 이미 확보되어 스킵합니다.")
                            continue
                    logger.info(f"🧐 영상({v_id})은 이미 등록되어 있지만, 셋리스트가 비어있어 상세 분석을 진행합니다.")

                # 2. 영상 상세 정보 가져오기 (설명란 포함)
                v_title, duration_sec, description, channel = get_video_info(url)
                if not v_title: continue
                    
                logger.info(f"📺 영상 분석 중: {v_title} ({duration_sec}s)")

                # 3. AI 파싱 (진짜 도시와 날짜, 셋리스트 추출)
                metadata = parse_fancam_metadata(v_title, channel, description)
                if not metadata: continue
                
                c_date_str = metadata.get("date", "Unknown")
                detected_city = metadata.get("city", city)
                
                # 4. 실제 콘서트 객체 찾기
                concert_query = db.query(Concert).filter(Concert.city.like(f"%{detected_city}%"))
                if c_date_str != "Unknown" and c_date_str:
                    try:
                        c_date = datetime.strptime(c_date_str, "%Y-%m-%d")
                        concert_query = concert_query.filter(Concert.date == c_date)
                    except: pass
                
                concert_obj = concert_query.first()
                if not concert_obj:
                    # AI 판독 도시로 못 찾으면 원래 검색어 도시로 재시도
                    concert_obj = db.query(Concert).filter(Concert.city.like(f"%{city}%")).first()
                
                if not concert_obj:
                    logger.warning(f"⚠️ 콘서트 정보를 찾을 수 없습니다: {detected_city} ({c_date_str})")
                    continue

                if detected_city.lower() not in city.lower():
                    logger.info(f"🔄 도시 불일치 감지: 검색({city}) -> 실제({detected_city}). {detected_city} 기준으로 처리합니다.")

                # 5. 셋리스트 자동 생성 (비어있을 때만)
                ai_setlist = metadata.get("setlist", [])
                existing_count = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_obj.id).count()
                
                if ai_setlist and existing_count == 0:
                    if len(ai_setlist) >= 20: # 🛡️ 안전장치: 20곡 이상
                        logger.info(f"📝 {concert_obj.city} ({concert_obj.date}) 공연의 셋리스트 {len(ai_setlist)}개를 자동 생성합니다.")
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
                        # 🛡️ 중요: 같은 도시의 다음 영상을 위해 개수 업데이트
                        existing_count = len(ai_setlist)
                    else:
                        logger.warning(f"⚠️ 발견된 셋리스트 항목이 {len(ai_setlist)}개로 너무 적어 무시합니다.")
                elif existing_count > 0:
                    logger.info(f"ℹ️ {concert_obj.city} 공연은 이미 {existing_count}개의 셋리스트가 존재하여 건너뜁니다.")

                # 6. 신규 영상일 경우에만 제보 생성
                if not exists_v:
                    # 해당 콘서트의 모든 노래 ID 수집
                    setlist_entries = db.query(ConcertSetlist).filter(
                        ConcertSetlist.concert_id == concert_obj.id,
                        ConcertSetlist.song_id.isnot(None)
                    ).all()
                    all_song_ids = list(set(e.song_id for e in setlist_entries))

                    new_contrib = Contribution(
                        suggested_url=url,
                        suggested_title=v_title,
                        suggested_song_ids=all_song_ids,
                        suggested_concert_id=concert_obj.id,
                        suggested_members=["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"],
                        suggested_duration=duration_sec,
                        suggested_angle="Full-Concert",
                        suggested_sync_offset=0.0,
                        user_ip="full-concert-importer-ai",
                        is_processed=0
                    )
                    db.add(new_contrib)
                    db.commit()
                    logger.info(f"✅ 신규 영상 제보 완료: {v_title}")

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
