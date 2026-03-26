import os
import json
import asyncio
import sys
import logging
import random
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from playwright.async_api import async_playwright

# 프로젝트 루트를 path에 추가하여 app 모듈 참조 가능하게 함
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.models.models import Base, Video, Song, Concert, Contribution
from app.crawler.ai_parser import parse_fancam_metadata_async
from app.crawler.step1_search import get_video_id, timestamp_to_seconds

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = "sqlite:///./twice_fancam.db"
USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data")

async def get_video_info_async(page, url):
    """비동기 방식으로 영상 상세 정보(제목, 길이, 설명, 채널명)를 추출"""
    try:
        await page.goto(url)
        # 타이틀 대기
        await page.wait_for_selector("ytd-watch-metadata h1, #title h1", timeout=20000)
        title = await page.locator("ytd-watch-metadata h1, #title h1").first.inner_text()
        title = title.strip()
        
        # 설명란 추출
        description = ""
        try:
            expand_button = page.locator("#expand, tp-yt-paper-button#expand")
            if await expand_button.count() > 0:
                await expand_button.first.click()
                await asyncio.sleep(0.5)
            
            desc_selectors = ["#description-inline-expander", "#description", "ytd-video-secondary-info-renderer #description"]
            for sel in desc_selectors:
                elem = page.locator(sel)
                if await elem.count() > 0:
                    description = await elem.first.inner_text()
                    if description: break
        except: pass

        # 길이 추출 (간단히 ytp-time-duration 사용)
        duration_sec = 0
        try:
            duration_text = await page.evaluate("document.querySelector('.ytp-time-duration').innerText")
            duration_sec = timestamp_to_seconds(duration_text)
        except: pass

        # 채널명
        channel = "Unknown"
        try:
            channel = await page.locator("#owner-and-teaser #channel-name a, .ytd-channel-name a").first.inner_text()
        except: pass

        return title, duration_sec, description, channel
    except Exception as e:
        logger.error(f"Error in get_video_info_async: {e}")
        return None, 0, "", ""

async def run_recommendation_chain_async(depth=15):
    """(비동기) 알고리즘 꼬리물기 탐색을 수행하여 신규 직캠 발굴"""
    if not os.path.exists(USER_DATA_DIR):
        logger.error("❌ user_data 폴더가 없습니다. 로그인 프로필이 생성되지 않았습니다.")
        return

    logger.info(f"🚀 Step 2: 알고리즘 꼬리물기 탐색 시작 (최대 깊이: {depth})")
    
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    new_video_count = 0
    processed_ids = set()
    
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        
        # 1. 고품질 콘서트 영상으로 시작점 잡기
        from urllib.parse import quote
        logger.info("🎯 마스터급 콘서트 영상으로 시작점을 잡습니다...")
        search_query = "TWICE THIS IS FOR World Tour Full Concert 4K"
        await page.goto(f"https://www.youtube.com/results?search_query={quote(search_query)}")
        await page.wait_for_selector("a#video-title", timeout=15000)
        
        first_video = page.locator("a#video-title").first
        start_href = await first_video.get_attribute("href")
        start_url = "https://www.youtube.com" + start_href
        logger.info(f"🔍 시작점 확보: {await first_video.get_attribute('title')}")

        current_url = start_url
        
        # 2. 연쇄 탐색 루프
        for d in range(depth):
            logger.info(f"📍 [깊이 {d+1}/{depth}] 탐색 중: {current_url}")
            
            # 영상 상세 정보 및 AI 파싱
            v_title, duration_sec, description, channel = await get_video_info_async(page, current_url)
            yt_id = get_video_id(current_url)
            
            if v_title and yt_id not in processed_ids:
                # 불필요한 영상 필터링 (응원법, 쇼츠 등)
                exclude_keywords = ["cheering guide", "응원법", "teaser", "shorts", "official mv", "challenge"]
                if not any(k in v_title.lower() for k in exclude_keywords):
                    
                    # 이미 등록된 영상인지 체크
                    if not db.query(Video).filter(Video.youtube_id == yt_id).first():
                        metadata = await parse_fancam_metadata_async(v_title, channel, description)
                        
                        if metadata and metadata.get("is_valid_fancam"):
                            # Concert & Song 매칭
                            c_city = metadata.get("city")
                            concert_obj = db.query(Concert).filter(Concert.city.like(f"%{c_city}%")).first()
                            
                            song_ids = []
                            for s_name in metadata.get("songs", []):
                                s_obj = db.query(Song).filter(Song.name == s_name).first()
                                if s_obj: song_ids.append(s_obj.id)
                            
                            new_contrib = Contribution(
                                suggested_url=current_url,
                                suggested_title=v_title,
                                suggested_song_ids=song_ids,
                                suggested_concert_id=concert_obj.id if concert_obj else None,
                                suggested_members=metadata.get("members", ["Unknown"]),
                                suggested_duration=duration_sec,
                                suggested_angle=metadata.get("angle", "Unknown"),
                                suggested_sync_offset=0.0,
                                user_ip="recommendation-chain-async"
                            )
                            db.add(new_contrib)
                            db.commit()
                            new_video_count += 1
                            logger.info(f"✅ 신규 발굴 완료: {v_title[:30]}...")
                
                processed_ids.add(yt_id)

            # 다음 후보 찾기 (사이드바)
            logger.info("⏭️  다음 추천 후보 검색...")
            sidebar_links = await page.locator("#items a[href*='/watch?v=']").all()
            next_url = None
            
            # 리스트를 섞어 다양성 확보
            random.shuffle(sidebar_links)
            
            # 투어 관련 핵심 키워드
            tour_keywords = ["this is for", "concert", "tour", "fancam", "focus", "직캠", "콘서트", "4k"]
            
            for link in sidebar_links:
                l_title = await link.inner_text()
                l_href = await link.get_attribute("href")
                if not l_href: continue
                l_id = get_video_id(l_href)
                
                # 아직 안 가본 영상 + 투어 관련성 + 제외 키워드 없음
                if l_id not in processed_ids and any(k in l_title.lower() for k in tour_keywords):
                    if not any(k in l_title.lower() for k in exclude_keywords):
                        next_url = "https://www.youtube.com" + l_href
                        logger.info(f"🔗 다음 추천 영상 발견: {l_title.strip()[:40]}...")
                        break
            
            if not next_url:
                logger.warning("🚫 더 이상 새로운 투어 관련 추천 영상이 없습니다.")
                break
            
            current_url = next_url
            await asyncio.sleep(random.uniform(2, 4)) # 매너 대기

        await context.close()
    db.close()
    logger.info(f"🎉 탐색 완료. 총 {new_video_count}개의 새로운 직캠을 발굴했습니다.")

if __name__ == "__main__":
    asyncio.run(run_recommendation_chain_async(depth=50))
