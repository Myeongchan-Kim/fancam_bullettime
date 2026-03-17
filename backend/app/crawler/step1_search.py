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

def get_video_id(url):
    """유튜브 URL에서 Video ID 추출"""
    if not url: return None
    query = urlparse(url).query
    return parse_qs(query).get("v", [None])[0]

def run_target_search(limit_cities=5):
    if not os.path.exists(USER_DATA_DIR):
        print("경고: user_data 폴더가 없습니다. login.py를 먼저 실행하여 로그인해주세요.")
        return

    print(f"Step 1: Target Search Crawler (전역 검색 모드) 시작... (최대 {limit_cities}개 도시)")
    db = SessionLocal()

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.pages[0] if context.pages else context.new_page()

        # 검색 대상 도시 선정 (랜덤하게 5개 도시 선택하거나 순차적으로)
        schedules = TOUR_DATA["schedule"]
        random.shuffle(schedules)
        target_schedules = schedules[:limit_cities]
        
        # 주요 검색 곡 선정
        main_songs = ["Strategy", "THIS IS FOR", "MAKE ME GO", "SET ME FREE", "FANCY (Rock ver.)"]

        for schedule in target_schedules:
            city = schedule["city"]
            country = schedule["country"]
            # 해당 도시에서 무작위 곡 하나 선택하여 검색 (너무 많이 검색하면 봇 탐지 가능성 때문)
            song = random.choice(main_songs)
            
            search_query = f"TWICE {city} {song} Fancam 4K"
            print(f"\n>>> 검색 시도: {search_query} ({country})")
            
            try:
                page.goto(f"https://www.youtube.com/results?search_query={search_query}")
                page.wait_for_selector("ytd-video-renderer", timeout=15000)
                time.sleep(2) # 렌더링 안정화 대기
                
                videos = page.locator("ytd-video-renderer").all()[:5]
                
                for idx, video in enumerate(videos):
                    try:
                        title_elem = video.locator("a#video-title")
                        title = title_elem.get_attribute("title")
                        href = title_elem.get_attribute("href")
                        if not href: continue
                        
                        url = "https://www.youtube.com" + href
                        yt_id = get_video_id(url)
                        
                        channel_elems = video.locator(".ytd-channel-name a").all()
                        channel = channel_elems[0].inner_text() if channel_elems else "Unknown"
                        
                        if not yt_id: continue
                        
                        # 중복 체크
                        if db.query(Video).filter(Video.youtube_id == yt_id).first():
                            print(f"  [{idx+1}] 이미 존재: {yt_id}")
                            continue

                        # AI 파싱 (메타데이터 추출)
                        metadata = parse_fancam_metadata(title, channel)
                        if not metadata or not metadata.get("is_valid_fancam"):
                            print(f"  [{idx+1}] 유효하지 않은 영상 스킵: {title[:30]}...")
                            continue

                        # DB 매핑 (Song & Concert)
                        s_name = metadata.get("song")
                        c_city = metadata.get("city")
                        
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
                        print(f"  [{idx+1}] DB 저장 성공! (곡: {s_name}, 도시: {c_city})")
                        
                        # 알고리즘 훈련 (가상 시청 - 짧게)
                        v_page = context.new_page()
                        v_page.goto(url)
                        time.sleep(3)
                        v_page.close()
                        
                    except Exception as e:
                        print(f"  영상 파싱 에러: {e}")
                        continue
                        
            except Exception as e:
                print(f"도시 {city} 검색 중 에러: {e}")
                continue
                
            # 도시 간 검색 간격 (봇 탐지 방지)
            time.sleep(5)
            
        print("\n모든 대상 도시 검색 완료.")
        db.close()
        context.close()

if __name__ == "__main__":
    run_target_search(limit_cities=5) # 이번엔 5개 도시만 테스트
