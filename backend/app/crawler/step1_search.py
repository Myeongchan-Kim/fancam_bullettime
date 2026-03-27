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

from app.models.models import Base, Video, Song, Concert, Contribution, ConcertSetlist
from app.crawler.ai_parser import parse_fancam_metadata

DATABASE_URL = "sqlite:///./twice_fancam.db"
USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data")

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# 멤버 및 주요 곡 목록 (검색용)
MEMBERS = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"]
MAIN_SONGS = ["THIS IS FOR", "Strategy", "FANCY", "Feel Special", "I CAN'T STOP ME"]

# Load tour info for city dates
TOUR_INFO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
with open(TOUR_INFO_PATH, "r") as f:
    TOUR_DATA = json.load(f)

def get_video_id(url):
    parsed = urlparse(url)
    if parsed.hostname == 'youtu.be':
        return parsed.path[1:]
    if parsed.hostname in ('www.youtube.com', 'youtube.com'):
        if parsed.path == '/watch':
            return parse_qs(parsed.query)['v'][0]
        if parsed.path[:7] == '/embed/':
            return parsed.path[7:]
        if parsed.path[:3] == '/v/':
            return parsed.path[3:]
    return None

def timestamp_to_seconds(ts):
    if not ts: return 0.0
    try:
        parts = ts.split(':')
        if len(parts) == 3: # HH:MM:SS
            return float(int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]))
        elif len(parts) == 2: # MM:SS
            return float(int(parts[0]) * 60 + int(parts[1]))
        return 0.0
    except Exception as e:
        logger.warning(f"Failed to parse timestamp '{ts}': {e}")
        return 0.0

def search_youtube(query: str, limit: int = 5):
    """유튜브 검색 결과의 URL 목록을 반환"""
    urls = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(f"https://www.youtube.com/results?search_query={query}")
            page.wait_for_selector("ytd-video-renderer", timeout=15000)
            time.sleep(1.5)
            
            videos = page.locator("ytd-video-renderer").all()[:limit]
            for video in videos:
                title_elem = video.locator("a#video-title")
                href = title_elem.get_attribute("href")
                if href:
                    urls.append("https://www.youtube.com" + href)
            browser.close()
        except Exception as e:
            logger.error(f"Search error: {e}")
            browser.close()
    return urls

def get_video_info(url: str):
    """영상 상세 정보(제목, 길이, 설명, 채널명)를 반환"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url)
            # 타이틀 셀렉터를 더 정확하게 (첫 번째 항목만)
            page.wait_for_selector("ytd-watch-metadata h1, #title h1", timeout=20000)
            title = page.locator("ytd-watch-metadata h1, #title h1").first.inner_text().strip()
            
            # 설명란 가져오기
            description = ""
            try:
                # '더보기' 버튼 클릭 시도
                expand_button = page.locator("#expand, tp-yt-paper-button#expand")
                if expand_button.count() > 0 and expand_button.first.is_visible():
                    expand_button.first.click()
                    time.sleep(0.5)
                
                # 여러 가능한 설명란 셀렉터 시도
                desc_selectors = ["#description-inline-expander", "#description", "ytd-video-secondary-info-renderer #description"]
                for sel in desc_selectors:
                    elem = page.locator(sel)
                    if elem.count() > 0:
                        description = elem.first.inner_text()
                        if description: break
            except Exception as e:
                logger.warning(f"설명란 추출 실패: {e}")
            
            # 길이 추출
            duration_text = "0:00"
            try:
                duration_text = page.evaluate("document.querySelector('.ytp-time-duration').innerText")
            except:
                pass
            duration_sec = timestamp_to_seconds(duration_text)
            
            # 채널명
            channel_name = "Unknown"
            try:
                channel_name = page.locator("#owner-and-teaser #channel-name a, .ytd-channel-name a").first.inner_text()
            except:
                pass
                
            browser.close()
            return title, duration_sec, description, channel_name
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            browser.close()
            return None, 0, "", ""

def run_deep_dive(target_city, limit_videos_per_query=5):
    """특정 도시를 집중적으로 수집하는 로직"""
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    new_video_count = 0
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

                        # Extract Duration
                        duration_text = ""
                        try:
                            duration_elem = video.locator("ytd-thumbnail-overlay-time-status-renderer span#text")
                            if duration_elem.count() > 0:
                                duration_text = duration_elem.first.inner_text().strip()
                        except: pass
                        duration_sec = timestamp_to_seconds(duration_text)

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
                                    
                            # Improved Concert Selection Logic: Use both city and date
                            c_date_str = metadata.get("date")
                            concert_obj = None
                            
                            if c_date_str:
                                try:
                                    # Convert YYYY-MM-DD to datetime for comparison
                                    c_date = datetime.strptime(c_date_str, "%Y-%m-%d")
                                    concert_obj = db.query(Concert).filter(
                                        Concert.city == c_city,
                                        Concert.date == c_date
                                    ).first()
                                except Exception as e:
                                    logger.warning(f"      ⚠️ 날짜 파싱 실패 ({c_date_str}): {e}")

                            # Fallback: If date-specific concert not found, pick the first one by city
                            if not concert_obj:
                                concert_obj = db.query(Concert).filter(Concert.city == c_city).first()

                            # Auto-calculate suggested sync_offset if setlist data exists
                            suggested_offset = 0.0
                            if concert_obj and song_objs:
                                first_song_id = song_objs[0].id
                                setlist_entry = db.query(ConcertSetlist).filter(
                                    ConcertSetlist.concert_id == concert_obj.id,
                                    ConcertSetlist.song_id == first_song_id
                                ).first()
                                if setlist_entry:
                                    suggested_offset = setlist_entry.start_time
                                    logger.info(f"    ⏲️  마스터 타임라인에서 sync_offset 발견: {suggested_offset}s ({song_objs[0].name})")

                            is_shorts = "/shorts/" in url or (duration_sec > 0 and duration_sec < 65)

                            new_contrib = Contribution(
                                suggested_url=url,
                                suggested_title=title,
                                suggested_song_ids=[s.id for s in song_objs],
                                suggested_concert_id=concert_obj.id if concert_obj else None,
                                suggested_members=metadata.get("members", []),
                                suggested_duration=duration_sec,
                                suggested_is_shorts=is_shorts, # 쇼츠 여부 저장
                                suggested_angle="Unknown",
                                suggested_sync_offset=suggested_offset,
                                user_ip="step1-crawler",
                                is_processed=0
                            )
                            db.add(new_contrib)
                            db.commit()
                            logger.info(f"    ✅ 제안 완료 ({'Shorts' if is_shorts else 'Video'}): {title}")

                            
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
                db.commit() # Commit all new contributions for this search query
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
