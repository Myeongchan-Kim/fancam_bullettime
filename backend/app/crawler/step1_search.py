import os
import json
import time
import sys
import random
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.crawler.ai_parser import parse_fancam_metadata
from app.models.models import Video, Song, Concert

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
    """유튜브 URL에서 Video ID 추출"""
    if not url: return None
    query = urlparse(url).query
    return parse_qs(query).get("v", [None])[0]

def run_deep_dive(target_city=None, limit_videos_per_query=5):
    if not os.path.exists(USER_DATA_DIR):
        print("경고: user_data 폴더가 없습니다. login.py를 먼저 실행하여 로그인해주세요.")
        return

    db = SessionLocal()
    
    # Target city selection
    if target_city:
        target_schedules = [s for s in TOUR_DATA["schedule"] if s["city"].lower() == target_city.lower()]
        if not target_schedules:
            print(f"도시 '{target_city}'를 일정에서 찾을 수 없습니다.")
            return
    else:
        # If no city provided, pick a random one from schedule
        target_schedules = [random.choice(TOUR_DATA["schedule"])]
    
    selected_city = target_schedules[0]["city"]
    print(f"🚀 '{selected_city}' 도시 집중 공략 모드 시작...")

    # Generate search queries based on tips
    queries = []
    queries.append(f"TWICE {selected_city} Full Concert")
    for member in MEMBERS:
        queries.append(f"TWICE {selected_city} {member} Focus")
        queries.append(f"TWICE {selected_city} {member} 직캠")
    for song in MAIN_SONGS:
        queries.append(f"TWICE {selected_city} {song} Fancam 4K")

    random.shuffle(queries) # To make training more natural

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.pages[0] if context.pages else context.new_page()

        for query in queries:
            print(f"\n🔍 검색어: {query}")
            
            try:
                page.goto(f"https://www.youtube.com/results?search_query={query}")
                page.wait_for_selector("ytd-video-renderer", timeout=15000)
                time.sleep(2)
                
                videos = page.locator("ytd-video-renderer").all()[:limit_videos_per_query]
                
                for idx, video in enumerate(videos):
                    try:
                        title_elem = video.locator("a#video-title")
                        title = title_elem.get_attribute("title")
                        href = title_elem.get_attribute("href")
                        if not href: continue
                        
                        url = "https://www.youtube.com" + href
                        yt_id = get_video_id(url)
                        if not yt_id: continue
                        
                        # 중복 체크
                        if db.query(Video).filter(Video.youtube_id == yt_id).first():
                            # print(f"  [{idx+1}] 이미 존재: {yt_id}")
                            continue

                        channel_elems = video.locator(".ytd-channel-name a").all()
                        channel = channel_elems[0].inner_text() if channel_elems else "Unknown"

                        # AI 파싱
                        metadata = parse_fancam_metadata(title, channel)
                        if not metadata or not metadata.get("is_valid_fancam"):
                            print(f"  [{idx+1}] 유효하지 않은 영상 (AI 필터링): {title[:30]}...")
                            continue

                        # DB 매핑
                        s_name = metadata.get("song")
                        c_city = metadata.get("city") or selected_city # Fallback to target city
                        
                        song_obj = db.query(Song).filter(Song.name == s_name).first()
                        concert_obj = db.query(Concert).filter(Concert.city == c_city).first()

                        # DB 저장
                        new_video = Video(
                            youtube_id=yt_id,
                            title=title,
                            url=url,
                            song_id=song_obj.id if song_obj else None,
                            concert_id=concert_obj.id if concert_obj else None,
                            members=metadata.get("members", ["Unknown"]),
                            thumbnail_url=f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg"
                        )
                        db.add(new_video)
                        db.commit()
                        print(f"  ✅ DB 저장 성공! [{s_name or 'Full Concert'}] - {title[:40]}...")
                        
                        # 알고리즘 훈련 (짧게 시청)
                        v_page = context.new_page()
                        v_page.goto(url)
                        time.sleep(3)
                        v_page.close()
                        
                    except Exception as e:
                        print(f"  ❌ 영상 처리 중 에러: {e}")
                        continue
                        
            except Exception as e:
                print(f"❌ 쿼리 '{query}' 검색 중 에러: {e}")
                continue
                
            time.sleep(random.uniform(2, 5)) # Random delay between queries
            
        print(f"\n✨ '{selected_city}' 집중 공략 완료.")
        db.close()
        context.close()

if __name__ == "__main__":
    # If a city argument is passed, use it. Otherwise random.
    target = sys.argv[1] if len(sys.argv) > 1 else None
    run_deep_dive(target_city=target)
