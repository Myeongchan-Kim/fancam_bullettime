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

from app.db import SessionLocal
from app.models.models import Song, Concert, ConcertSetlist, Video, Contribution
from app.api.v1.utils import _maybe_auto_approve
from app.crawler.ai_parser import parse_fancam_metadata_async
from app.crawler.step1_search import get_video_id, timestamp_to_seconds

load_dotenv()

# 로그 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000/api")
USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data_2")

async def dismiss_consent_or_popups(page):
    """유튜브 쿠키 동의 팝업 및 로그인 유도 다이얼로그 닫기"""
    try:
        consent_selectors = [
            'button[aria-label*="Accept"]',
            'button[aria-label*="동의"]',
            'button[aria-label*="Reject"]',
            'tp-yt-paper-dialog #dismiss-button',
            'ytd-button-renderer#dismiss-button'
        ]
        for sel in consent_selectors:
            btn = page.locator(sel)
            if await btn.count() > 0 and await btn.first.is_visible():
                await btn.first.click()
                await asyncio.sleep(0.5)
                break
    except Exception:
        pass

async def get_video_info_async(page, url):
    """비동기 방식으로 영상 상세 정보(제목, 길이, 설명, 채널명)를 추출 및 알고리즘 훈련 시청 수행"""
    try:
        # networkidle 대신 빠른 domcontentloaded 사용
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await dismiss_consent_or_popups(page)

        # 타이틀 대기
        await page.wait_for_selector("ytd-watch-metadata h1, #title h1", timeout=15000)
        title_elem = page.locator("ytd-watch-metadata h1, #title h1").first
        title = (await title_elem.inner_text()).strip()

        # 유튜브 추천 알고리즘 훈련을 위해 5~8초간 실제 재생 유지
        try:
            # 포커스를 비디오 플레이어로 두고 'k' (재생/일시정지)
            await page.keyboard.press("k")
            await asyncio.sleep(random.uniform(5.0, 7.0))
        except Exception:
            await asyncio.sleep(3.0)

        # 길이 추출 (안전한 파싱)
        duration_sec = 0.0
        try:
            duration_val = await page.eval_on_selector("video", "el => el.duration || 0")
            if duration_val and not (isinstance(duration_val, str) and duration_val == "NaN"):
                duration_sec = float(duration_val)
        except Exception:
            pass

        # 설명란 추출
        description = ""
        try:
            expand_button = page.locator("#expand, tp-yt-paper-button#expand, ytd-text-inline-expander #expand")
            if await expand_button.count() > 0 and await expand_button.first.is_visible():
                await expand_button.first.click()
                await asyncio.sleep(0.3)
            
            desc_selectors = ["#description-inline-expander", "#description", "ytd-video-secondary-info-renderer #description"]
            for sel in desc_selectors:
                elem = page.locator(sel)
                if await elem.count() > 0:
                    description = await elem.first.inner_text()
                    if description.strip():
                        break
        except Exception:
            pass

        channel = "Unknown"
        try:
            channel_elem = page.locator("#owner-and-teaser #channel-name a, .ytd-channel-name a, #upload-info #channel-name a").first
            channel = (await channel_elem.inner_text()).strip()
        except Exception:
            pass

        return title, duration_sec, description, channel
    except Exception as e:
        logger.error(f"Error in get_video_info_async: {e}")
        return None, 0, "", ""

async def get_recommendation_candidates(page):
    """사이드바 지연 로딩을 트리거하고 유효한 다음 추천 영상 URL 목록을 추출"""
    # 1. 사이드바 Lazy-loading 유도를 위한 마우스 스크롤
    await page.mouse.wheel(0, 1000)
    await asyncio.sleep(1.2)
    await page.mouse.wheel(0, 500)
    await asyncio.sleep(0.8)

    # 2. 다중 셀렉터로 추천 영상 섬네일 링크 탐색
    candidate_selectors = [
        "ytd-compact-video-renderer a#thumbnail",
        "#related ytd-compact-video-renderer a#thumbnail",
        "ytd-item-section-renderer ytd-compact-video-renderer a#thumbnail",
        "#related a#thumbnail"
    ]

    links = []
    for sel in candidate_selectors:
        elements = page.locator(sel)
        cnt = await elements.count()
        if cnt > 0:
            for idx in range(min(cnt, 20)):
                href = await elements.nth(idx).get_attribute("href")
                if href and ("/watch?v=" in href or "/shorts/" in href):
                    full_url = f"https://www.youtube.com{href}" if href.startswith("/") else href
                    if full_url not in links:
                        links.append(full_url)
            if links:
                break

    return links

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

        # 1. 메타데이터 동기화 (노래, 콘서트, 세트리스트 맵)
        songs_data = []
        concerts_data = []
        song_map = {}
        setlist_offset_map = {}
        recent_videos = []

        try:
            db = SessionLocal()
            try:
                db_songs = db.query(Song).all()
                songs_data = [{"id": s.id, "name": s.name} for s in db_songs]
                song_map = {s.name.lower(): s.id for s in db_songs}

                db_concerts = db.query(Concert).all()
                concerts_data = [{"id": c.id, "city": c.city, "date": str(c.date)} for c in db_concerts]

                db_setlists = db.query(ConcertSetlist).all()
                for item in db_setlists:
                    if item.song_id is not None and item.start_time is not None:
                        setlist_offset_map[(item.concert_id, item.song_id)] = item.start_time

                db_recent = db.query(Video).order_by(Video.created_at.desc()).limit(100).all()
                recent_videos = [{"id": v.id, "title": v.title, "youtube_id": v.youtube_id} for v in db_recent]
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"⚠️ DB 직접 조회 실패, API 폴백 시도: {e}")
            try:
                songs_data = requests.get(f"{API_BASE_URL}/songs", timeout=5).json()
                song_map = {s['name'].lower(): s['id'] for s in songs_data}
                concerts_data = requests.get(f"{API_BASE_URL}/concerts", timeout=5).json()
                for c in concerts_data:
                    for item in c.get("setlist", []):
                        s_id = item.get("song_id")
                        st = item.get("start_time")
                        if s_id is not None and st is not None:
                            setlist_offset_map[(c["id"], s_id)] = st
                recent_videos = requests.get(f"{API_BASE_URL}/videos", timeout=5).json()[:100]
            except Exception as api_err:
                logger.error(f"❌ 메타데이터 조회 실패: {api_err}")
                await asyncio.sleep(10)
                continue

        async with async_playwright() as p:
            # 봇 감지 회피 및 세션 유지를 위해 persistent context 사용
            context = await p.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                headless=True,
                channel="chrome",
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--autoplay-policy=no-user-gesture-required"
                ]
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
                    search_query = "TWICE THIS IS FOR World Tour Full Concert"
                    await page.goto(f"https://www.youtube.com/results?search_query={quote(search_query)}", wait_until="domcontentloaded")
                    await dismiss_consent_or_popups(page)
                    await page.wait_for_selector("a#video-title", timeout=15000)
                    first_v = page.locator("a#video-title").first
                    href = await first_v.get_attribute('href')
                    start_url = f"https://www.youtube.com{href}"

                # 3. 꼬리물기 탐색 시작
                current_url = start_url
                for i in range(depth):
                    v_id = get_video_id(current_url)
                    if not v_id or v_id in processed_ids:
                        break
                    processed_ids.add(v_id)

                    logger.info(f"   [{i+1}/{depth}] 분석 중: {current_url}")
                    
                    title, duration, desc, channel = await get_video_info_async(page, current_url)
                    
                    if title:
                        # Gemini AI를 통한 직캠 메타데이터 파싱
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
                                if s_id:
                                    suggested_song_ids.append(s_id)

                            # sync_offset 자동 계산
                            suggested_offset = 0.0
                            if concert_id and suggested_song_ids:
                                first_s_id = suggested_song_ids[0]
                                suggested_offset = setlist_offset_map.get((concert_id, first_s_id), 0.0)
                                if suggested_offset > 0:
                                    logger.info(f"    ⏲️  세트리스트 매칭 sync_offset 계산: {suggested_offset}s")

                            is_shorts = "/shorts/" in current_url or (duration > 0 and duration < 65)

                            payload = {
                                "suggested_url": current_url,
                                "suggested_title": title,
                                "suggested_concert_id": concert_id,
                                "suggested_song_ids": suggested_song_ids if suggested_song_ids else None,
                                "suggested_members": metadata.get("members", []),
                                "suggested_duration": duration,
                                "suggested_is_shorts": is_shorts,
                                "suggested_angle": "Unknown",
                                "suggested_sync_offset": suggested_offset
                            }
                            
                            # 제보 API 호출 및 DB 저장
                            try:
                                resp = requests.post(f"{API_BASE_URL}/contributions", json=payload, timeout=5)
                                if resp.status_code == 200:
                                    new_video_count += 1
                                    logger.info(f"      ✅ 신규 발굴 및 API 제보 성공 ({'Shorts' if is_shorts else 'Video'}): {title}")
                                elif resp.status_code == 400 and "already exists" in resp.text:
                                    logger.info(f"      ℹ️ 이미 등록됨: {title}")
                                else:
                                    raise Exception(f"API status {resp.status_code}: {resp.text}")
                            except Exception as api_err:
                                # Direct DB fallback
                                try:
                                    db = SessionLocal()
                                    try:
                                        # Check duplicate
                                        existing_v = db.query(Video).filter(Video.youtube_id == v_id).first()
                                        existing_c = db.query(Contribution).filter(Contribution.suggested_url.contains(v_id)).first()
                                        if existing_v or existing_c:
                                            logger.info(f"      ℹ️ 이미 DB에 등록됨: {title}")
                                        else:
                                            new_contrib = Contribution(
                                                suggested_url=current_url,
                                                suggested_title=title,
                                                suggested_concert_id=concert_id,
                                                suggested_song_ids=suggested_song_ids if suggested_song_ids else None,
                                                suggested_members=metadata.get("members", []),
                                                suggested_duration=duration,
                                                suggested_is_shorts=is_shorts,
                                                suggested_angle="Unknown",
                                                suggested_sync_offset=suggested_offset
                                            )
                                            db.add(new_contrib)
                                            db.commit()
                                            db.refresh(new_contrib)
                                            new_video_count += 1
                                            logger.info(f"      💾 DB 직접 저장 성공 ({'Shorts' if is_shorts else 'Video'}): {title}")
                                            try:
                                                _maybe_auto_approve(db, new_contrib.id)
                                            except Exception as auto_err:
                                                logger.warning(f"Auto approve warning: {auto_err}")
                                    finally:
                                        db.close()
                                except Exception as db_err:
                                    logger.error(f"      ❌ DB 저장 에러: {db_err}")

                    # 4. 다음 추천 영상 선택 (사이드바 탐색)
                    candidates = await get_recommendation_candidates(page)
                    unvisited_candidates = [u for u in candidates if get_video_id(u) not in processed_ids]

                    if unvisited_candidates:
                        # 상위 8개 추천 중 랜덤 선택 (알고리즘 흐름 타기)
                        next_url = random.choice(unvisited_candidates[:min(len(unvisited_candidates), 8)])
                        current_url = next_url
                        logger.info(f"      ➡️ 다음 추천 영상으로 이동 ({len(unvisited_candidates)}개 후보 중 선택)")
                        await asyncio.sleep(random.uniform(2.0, 4.0))
                    else:
                        logger.warning("      ⚠️ 추천 영상 목록을 찾지 못하여 사이클을 종료합니다.")
                        break

            except Exception as e:
                logger.error(f"❌ 사이클 에러: {e}")
            
            await context.close()

        cycle_count += 1
        wait_time = random.randint(20, 40)
        logger.info(f"✨ 이번 사이클에서 {new_video_count}개 제보 완료. {wait_time}초 후 다음 사이클을 시작합니다...")
        await asyncio.sleep(wait_time)

if __name__ == "__main__":
    depth_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    asyncio.run(run_recommendation_chain_async(depth=depth_arg))
