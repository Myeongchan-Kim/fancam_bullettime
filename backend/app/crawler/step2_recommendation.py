import os
import json
import asyncio
import sys
import logging
import random
import time
import requests
from urllib.parse import quote
from playwright.async_api import async_playwright
from dotenv import load_dotenv

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.crawler.ai_parser import parse_fancam_metadata_async
from app.crawler.step1_search import get_video_id, timestamp_to_seconds

load_dotenv()

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000/api")
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

    logger.info(f"🚀 Step 2: 무한 추천 엔진 가동 시작 (API 모드 / 탐색 깊이: {depth})")
    logger.info(f"🔗 Target API: {API_BASE_URL}")

    cycle_count = 1
    while True:
        logger.info(f"🔄 --- [CYCLE #{cycle_count}] 탐색 시작 ---")
        new_video_count = 0
        processed_ids = set()

        # 1. API를 통해 메타데이터 동기화 (노래, 콘서트, 기존 영상 일부)
        try:
            songs_data = requests.get(f"{API_BASE_URL}/songs").json()
            song_map = {s['name'].lower(): s['id'] for s in songs_data}
            
            concerts_data = requests.get(f"{API_BASE_URL}/concerts").json()
            # 최근 100개 영상만 가져와서 시작점으로 활용
            recent_videos = requests.get(f"{API_BASE_URL}/videos").json()[:100]
        except Exception as e:
            logger.error(f"❌ API 서버 통신 실패. 10초 후 재시도... : {e}")
            await asyncio.sleep(10)
            continue

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
                # 2. 시작점 선정: 최근 영상 무작위 선택 vs 마스터 검색
                if recent_videos and cycle_count % 3 != 0: 
                    start_video = random.choice(recent_videos)
                    logger.info(f"🎯 API 기존 영상에서 시작점 선정: {start_video.get('title')}")
                    start_url = f"https://www.youtube.com/watch?v={start_video.get('youtube_id')}"
                else:
                    logger.info("🎯 마스터급 콘서트 영상 검색으로 시작점을 잡습니다...")
                    search_query = "TWICE THIS IS FOR World Tour Full Concert 4K"
                    await page.goto(f"https://www.youtube.com/results?search_query={quote(search_query)}")
                    await page.wait_for_selector("a#video-title", timeout=15000)
                    first_v = await page.locator("a#video-title").first
                    href = await first_v.get_attribute('href')
                    start_url = f"https://www.youtube.com{href}"

                # 3. 꼬리물기 탐색 시작
                current_url = start_url
                for i in range(depth):
                    v_id = get_video_id(current_url)
                    if not v_id or v_id in processed_ids: break
                    processed_ids.add(v_id)

                    logger.info(f"   [{i+1}/{depth}] 분석 중: {current_url}")
                    
                    title, duration, desc, channel = await get_video_info_async(page, current_url)
                    
                    if title:
                        # API를 통해 제보 제출 시도 (중복 시 400 반환)
                        metadata = await parse_fancam_metadata_async(title, channel, desc)
                        if metadata and metadata.get("is_valid_fancam"):
                            # 콘서트 매칭
                            detected_city = metadata.get("city", "Unknown")
                            concert_id = None
                            for c in concerts_data:
                                if detected_city.lower() in c['city'].lower():
                                    concert_id = c['id']
                                    break
                            
                            # 노래 매칭 (ID 변환)
                            suggested_song_ids = []
                            for s_name in metadata.get("songs", []):
                                s_id = song_map.get(s_name.lower())
                                if s_id: suggested_song_ids.append(s_id)
                            
                            payload = {
                                "suggested_url": current_url,
                                "suggested_title": title,
                                "suggested_concert_id": concert_id,
                                "suggested_song_ids": suggested_song_ids if suggested_song_ids else None,
                                "suggested_members": metadata.get("members", []),
                                "suggested_duration": duration,
                                "suggested_angle": "Unknown"
                            }
                            
                            # 제보 API 호출
                            resp = requests.post(f"{API_BASE_URL}/contributions", json=payload)
                            
                            if resp.status_code == 200:
                                new_video_count += 1
                                logger.info(f"      ✅ 신규 발굴 및 API 제보 성공: {title}")
                            elif resp.status_code == 400 and "already exists" in resp.text:
                                logger.info(f"      이미 등록됨: {title}")
                            else:
                                logger.warning(f"      ⚠️ 제보 실패 ({resp.status_code}): {resp.text}")

                    # 4. 다음 추천 영상 선택 (사이드바)
                    try:
                        recommendations = page.locator("ytd-compact-video-renderer a#thumbnail")
                        count = await recommendations.count()
                        if count > 0:
                            next_idx = random.randint(0, min(count - 1, 10))
                            next_href = await recommendations.nth(next_idx).get_attribute("href")
                            current_url = f"https://www.youtube.com{next_href}"
                            await asyncio.sleep(random.uniform(5, 10))
                        else: break
                    except: break

            except Exception as e:
                logger.error(f"❌ 사이클 에러: {e}")
            
            await context.close()

        cycle_count += 1
        wait_time = random.randint(30, 90) # 30~90초 대기
        logger.info(f"✨ 이번 사이클에서 {new_video_count}개 제보 완료. {wait_time}초 후 다시 시작합니다...")
        await asyncio.sleep(wait_time)

if __name__ == "__main__":
    asyncio.run(run_recommendation_chain_async(depth=50))
