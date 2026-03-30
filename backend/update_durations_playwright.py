import asyncio
import os
import logging
import argparse
from playwright.async_api import async_playwright
from sqlalchemy.orm import Session
from app.main import SessionLocal
from app.models.models import Video

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_DURATION = 9999.0
BATCH_SIZE = 5 # Small batch to avoid detection and heavy resource usage

async def get_video_duration_playwright(page, youtube_id):
    """Extract duration using Playwright from YouTube watch page."""
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    try:
        # Optimization: Block unnecessary resources
        await page.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf,otf}", lambda route: route.abort())
        
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        
        # Wait for the video element which usually contains the metadata
        await page.wait_for_selector("video", timeout=20000)
        
        # Extract duration from the HTML5 video element's metadata
        duration_sec = await page.eval_on_selector("video", "el => el.duration")
        
        if duration_sec and duration_sec > 0:
            return float(duration_sec)
        return None
    except Exception as e:
        logger.error(f"Failed to get duration for {youtube_id}: {e}")
        return None

async def run_duration_checker_playwright(target_youtube_id=None, target_video_id=None):
    db = SessionLocal()
    
    if target_video_id:
        videos = db.query(Video).filter(Video.id == target_video_id).all()
        if not videos:
            logger.error(f"❌ 데이터베이스에서 비디오 ID '{target_video_id}'를 찾을 수 없습니다.")
            db.close()
            return
    elif target_youtube_id:
        videos = db.query(Video).filter(Video.youtube_id == target_youtube_id).all()
        if not videos:
            logger.error(f"❌ 데이터베이스에서 유튜브 ID '{target_youtube_id}'를 찾을 수 없습니다.")
            db.close()
            return
    else:
        # Select videos with missing or default duration
        videos = db.query(Video).filter(
            (Video.duration == 0) | (Video.duration == None) | (Video.duration == DEFAULT_DURATION)
        ).all()
    
    if not videos:
        logger.info("모든 영상의 길이 정보가 이미 업데이트되어 있습니다.")
        db.close()
        return

    logger.info(f"🚀 총 {len(videos)}개의 영상에 대해 Playwright 기반 업데이트 시작...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a real user agent to reduce bot detection
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        updated_count = 0
        for i in range(0, len(videos), BATCH_SIZE):
            batch = videos[i : i + BATCH_SIZE]
            logger.info(f"📦 Batch {i//BATCH_SIZE + 1}/{(len(videos)-1)//BATCH_SIZE + 1} processing...")
            
            for video in batch:
                duration = await get_video_duration_playwright(page, video.youtube_id)
                
                if duration:
                    video.duration = duration
                    db.commit()
                    updated_count += 1
                    logger.info(f"✅ [{updated_count}/{len(videos)}] 업데이트 완료 ({duration:.2f}s): {video.title[:40]}...")
                else:
                    logger.warning(f"⚠️ [{video.id}] 정보를 가져오지 못함: {video.title[:40]}...")
                
                # Small random delay to feel more human
                await asyncio.sleep(1)

        await browser.close()

    db.close()
    logger.info(f"✨ 작업 완료! 총 {updated_count}개의 영상을 업데이트했습니다.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update video durations using Playwright.")
    parser.add_argument("--id", type=str, help="Specific YouTube video ID to update.")
    parser.add_argument("--video-id", type=int, help="Specific Database Video ID (integer) to update.")
    args = parser.parse_args()
    
    asyncio.run(run_duration_checker_playwright(args.id, args.video_id))
