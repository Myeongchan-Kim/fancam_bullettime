import os
import json
import asyncio
import sys
import logging
import random
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql.expression import func
from playwright.async_api import async_playwright

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.models.models import Base, Video, Song, Concert, Contribution
from app.crawler.ai_parser import parse_fancam_metadata_async
from app.crawler.step1_search import get_video_id, timestamp_to_seconds

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = "sqlite:///./twice_fancam.db"
# 병렬 실행을 위해 별도 프로필 폴더 사용
USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data_2")

async def get_video_info_async(page, url):
    """비동기 방식으로 영상 상세 정보(제목, 길이, 설명, 채널명)를 추출"""
    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)
        # 타이틀 대기
        await page.wait_for_selector("ytd-watch-metadata h1, #title h1", timeout=20000)
        title_elem = page.locator("ytd-watch-metadata h1, #title h1").first
        title = await title_elem.inner_text()
        title = title.strip()
        
        # 길이 추출 (aria-label 등에서 추출하거나 영상 태그 확인)
        duration_sec = 0
        try:
            # 유튜브 플레이어 내부에서 길이를 가져오는 시도
            duration_str = await page.eval_on_selector("video", "el => el.duration")
            duration_sec = float(duration_str)
        except: pass

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

        channel = "Unknown"
        try:
            channel_elem = page.locator("#owner-and-teaser #channel-name a, .ytd-channel-name a").first
            channel = await channel_elem.inner_text()
        except: pass

        return title, duration_sec, description, channel
    except Exception as e:
        logger.error(f"Error in get_video_info_async: {e}")
        return None, 0, "", ""

async def run_recommendation_chain_async(depth=30):
    """(비동기) 무한 루프 방식으로 알고리즘 꼬리물기 탐색 수행"""
    if not os.path.exists(USER_DATA_DIR):
        os.makedirs(USER_DATA_DIR, exist_ok=True)
        logger.info(f"📂 Created new profile directory: {USER_DATA_DIR}")

    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    logger.info(f"🚀 Step 2: 무한 추천 엔진 가동 시작 (탐색 깊이: {depth})")

    cycle_count = 1
    while True:
        logger.info(f"🔄 --- [CYCLE #{cycle_count}] 탐색 시작 ---")
        db = SessionLocal()
        new_video_count = 0
        processed_ids = set()

        async with async_playwright() as p:
            # 봇 감지 회피를 위해 브라우저 컨텍스트 설정 강화
            context = await p.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                headless=True,
                channel="chrome",
                args=["--disable-blink-features=AutomationControlled"]
            )
            page = await context.new_page()

            try:
                # 1. 시작점 선정: DB 무작위 영상 vs 마스터 검색
                start_video = db.query(Video).order_by(func.random()).first()
                
                if start_video and cycle_count % 3 != 0: 
                    logger.info(f"🎯 DB에서 시작점 선정: {start_video.title}")
                    start_url = f"https://www.youtube.com/watch?v={start_video.youtube_id}"
                else:
                    logger.info("🎯 마스터급 콘서트 영상 검색으로 시작점을 잡습니다...")
                    from urllib.parse import quote
                    search_query = "TWICE THIS IS FOR World Tour Full Concert 4K"
                    await page.goto(f"https://www.youtube.com/results?search_query={quote(search_query)}")
                    await page.wait_for_selector("a#video-title", timeout=15000)
                    first_v = await page.locator("a#video-title").first
                    href = await first_v.get_attribute('href')
                    start_url = f"https://www.youtube.com{href}"

                # 2. 꼬리물기 탐색 시작
                current_url = start_url
                for i in range(depth):
                    v_id = get_video_id(current_url)
                    if not v_id or v_id in processed_ids: break
                    processed_ids.add(v_id)

                    logger.info(f"   [{i+1}/{depth}] 분석 중: {current_url}")
                    
                    title, duration, desc, channel = await get_video_info_async(page, current_url)
                    
                    if title:
                        exists = db.query(Video).filter(Video.youtube_id == v_id).first()
                        if not exists:
                            metadata = await parse_fancam_metadata_async(title, channel, desc)
                            if metadata and metadata.get("is_valid_fancam"):
                                # 콘서트 매칭
                                detected_city = metadata.get("city", "Unknown")
                                concert_obj = db.query(Concert).filter(Concert.city.like(f"%{detected_city}%")).first()
                                
                                # 쇼츠 판별
                                is_shorts = "/shorts/" in current_url or (duration > 0 and duration < 65)

                                new_v = Video(
                                    youtube_id=v_id,
                                    title=title,
                                    thumbnail_url=f"https://i.ytimg.com/vi/{v_id}/maxresdefault.jpg",
                                    url=current_url,
                                    concert_id=concert_obj.id if concert_obj else None,
                                    members=metadata.get("members", []),
                                    sync_offset=0.0,
                                    duration=duration,
                                    is_shorts=is_shorts, # 쇼츠 정보 저장
                                    description=desc
                                )
                                db.add(new_v)
                                # 노래 매칭
                                for s_name in metadata.get("songs", []):
                                    song_obj = db.query(Song).filter(Song.name == s_name).first()
                                    if song_obj: new_v.songs.append(song_obj)
                                
                                db.commit()
                                new_video_count += 1
                                logger.info(f"      ✅ 신규 발굴 ({'Shorts' if is_shorts else 'Video'}): {title}")
                        else:
                            logger.info(f"      이미 등록됨: {title}")

                    # 3. 다음 추천 영상 선택 (사이드바)
                    try:
                        recommendations = page.locator("ytd-compact-video-renderer a#thumbnail")
                        count = await recommendations.count()
                        if count > 0:
                            # 상위 10개 중 무작위 선택
                            next_idx = random.randint(0, min(count - 1, 10))
                            next_href = await recommendations.nth(next_idx).get_attribute("href")
                            current_url = f"https://www.youtube.com{next_href}"
                            # 시청 시간 모방 (AI 학습 데이터 생성용 겸사겸사)
                            await asyncio.sleep(random.uniform(5, 10))
                        else: break
                    except: break

            except Exception as e:
                logger.error(f"❌ 사이클 에러: {e}")
            
            await context.close()

        db.close()
        cycle_count += 1
        wait_time = random.randint(30, 90) # 30~90초 대기
        logger.info(f"✨ 이번 사이클에서 {new_video_count}개 신규 발굴. {wait_time}초 후 다시 시작합니다...")
        await asyncio.sleep(wait_time)

if __name__ == "__main__":
    asyncio.run(run_recommendation_chain_async(depth=50))
