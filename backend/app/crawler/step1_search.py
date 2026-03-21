import os
import json
import time
import sys
import random
import logging
from datetime import datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.crawler.ai_parser import parse_fancam_metadata
from app.models.models import Video, Song, Concert

# 로그 설정
LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "crawler.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout) # 콘솔에도 동시에 출력 (원치 않으면 삭제 가능)
    ]
)
logger = logging.getLogger(__name__)

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data")
TOUR_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
DATABASE_URL = "sqlite:///./twice_fancam.db"

# DB 세션 설정
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
    TOUR_DATA = json.load(f)

MEMBERS = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"]
MAIN_SONGS = ["Strategy", "THIS IS FOR", "MAKE ME GO", "SET ME FREE", "FANCY (Rock ver.)"]

def get_video_id(url):
    if not url: return None
    query = urlparse(url).query
    return parse_qs(query).get("v", [None])[0]

def run_deep_dive(target_city, limit_videos_per_query=5):
    """특정 도시의 모든 키워드 조합으로 정밀 수집 수행"""
    if not os.path.exists(USER_DATA_DIR):
        logger.error("user_data 폴더가 없습니다. login.py를 먼저 실행하여 로그인해주세요.")
        return

    db = SessionLocal()
    logger.info(f"🚀 >>> '{target_city}' 집중 공략 시작...")

    # Generate search queries
    queries = []
    queries.append(f"TWICE {target_city} Full Concert")
    
    # Date-based queries (e.g., "TWICE 260320 Concert")
    city_dates = [s["date"] for s in TOUR_DATA["schedule"] if s["city"] == target_city and s["date"] != "9999-12-31"]
    for date_str in city_dates:
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            short_date = date_obj.strftime("%y%m%d") # YYMMDD format
            queries.append(f"TWICE {short_date} Concert")
            queries.append(f"TWICE {short_date} Fancam")
            queries.append(f"TWICE {date_str} Concert")
        except ValueError:
            pass

    for member in MEMBERS:
        queries.append(f"TWICE {target_city} {member} Focus")
        queries.append(f"TWICE {target_city} {member} 직캠")
    for song in MAIN_SONGS:
        queries.append(f"TWICE {target_city} {song} Fancam 4K")

    random.shuffle(queries)
    new_video_count = 0

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = context.pages[0] if context.pages else context.new_page()

        for query in queries:
            logger.info(f"  🔍 검색: {query}")
            try:
                page.goto(f"https://www.youtube.com/results?search_query={query}")
                page.wait_for_selector("ytd-video-renderer", timeout=15000)
                time.sleep(1.5)
                
                videos = page.locator("ytd-video-renderer").all()[:limit_videos_per_query]
                for video in videos:
                    try:
                        title_elem = video.locator("a#video-title")
                        title = title_elem.get_attribute("title")
                        url = "https://www.youtube.com" + title_elem.get_attribute("href")
                        yt_id = get_video_id(url)
                        
                        if not yt_id or db.query(Video).filter(Video.youtube_id == yt_id).first():
                            continue

                        channel_elems = video.locator(".ytd-channel-name a").all()
                        channel = channel_elems[0].inner_text() if channel_elems else "Unknown"
metadata = parse_fancam_metadata(title, channel)
if metadata and metadata.get("is_valid_fancam"):
    song_names = metadata.get("songs", [])
    c_city = metadata.get("city") or target_city

    song_objs = []
    for s_name in song_names:
        song_obj = db.query(Song).filter(Song.name == s_name).first()
        if song_obj:
            song_objs.append(song_obj)

    concert_obj = db.query(Concert).filter(Concert.city == c_city).first()
new_contrib = Contribution(
    suggested_url=url,
    suggested_title=title,
    suggested_song_ids=[s.id for s in song_objs],
    suggested_concert_id=concert_obj.id if concert_obj else None,
    suggested_members=metadata.get("members", ["Unknown"]),
    suggested_angle=metadata.get("angle", "Unknown"),
    user_ip="crawler"
)
db.add(new_contrib)
db.commit()

new_video_count += 1
logger.info(f"    ✅ 신규 제보 추가: {title[:40]}...")
                            # Training and Cooldown per video
                            v_page = context.new_page()
                            v_page.goto(url)
                            time.sleep(5) # Watch for 5 seconds for training
                            v_page.close()
                            
                            logger.info("    💤 영상 처리 후 1분 쿨타임 대기 중...")
                            time.sleep(60) # 1 minute cooldown per video
                    except Exception as e: 
                        logger.warning(f"    ⚠️ 개별 영상 처리 오류: {e}")
                        continue
            except Exception as e: 
                logger.error(f"  ❌ 쿼리 수행 오류: {e}")
                continue
            time.sleep(random.uniform(2, 4))
        
        context.close()
    
    db.close()
    logger.info(f"✨ '{target_city}' 완료. 새 영상 {new_video_count}개 수집됨.")
    return new_video_count

def run_auto_daemon(interval_minutes=3):
    """전체 도시를 3분 간격으로 무한 순회하며 수집"""
    # 중복 도시 제거 및 목록 추출
    cities = list(set([s["city"] for s in TOUR_DATA["schedule"]]))
    random.shuffle(cities)
    
    logger.info(f"🛰️ TWICE World Tour 360° 크롤러 데몬 시작 (주기: {interval_minutes}분)")
    logger.info(f"대상 도시 목록: {', '.join(cities)}")
    
    while True:
        for city in cities:
            try:
                run_deep_dive(city)
                logger.info(f"💤 도시 공략 완료. {interval_minutes}분 대기 후 다음 도시로 이동합니다...")
                time.sleep(interval_minutes * 60)
            except KeyboardInterrupt:
                logger.info("👋 크롤러 데몬을 종료합니다.")
                return
            except Exception as e:
                logger.error(f"❌ 데몬 에러 발생 (시티: {city}): {e}")
                time.sleep(60) # 에러 시 1분 휴식 후 재시도

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 특정 도시 수동 모드
        run_deep_dive(sys.argv[1])
    else:
        # 자동 데몬 모드
        run_auto_daemon(interval_minutes=3)
