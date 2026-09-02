"""
YouTube Availability Health Checker
Uses YouTube oEmbed API to rapidly check whether videos are active, deleted, or privatized.
Marks deleted/private videos as `is_unavailable = True` in DB so they are excluded from UI
while preserving the youtube_id to prevent redundant crawling.
"""

import os
import sys
import asyncio
import httpx
import dotenv
from typing import List, Tuple

# Load environment
dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video

OEMBED_URL = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={}&format=json"

async def check_video_status(client: httpx.AsyncClient, video_id: int, youtube_id: str, semaphore: asyncio.Semaphore) -> Tuple[int, str, bool]:
    url = OEMBED_URL.format(youtube_id)
    async with semaphore:
        try:
            resp = await client.get(url, timeout=5.0)
            # 200 = Active, 404/401/403/400 = Unavailable/Private/Deleted
            if resp.status_code == 200:
                return video_id, youtube_id, True
            else:
                return video_id, youtube_id, False
        except Exception:
            # On timeout or connection error, default to True (don't prematurely kill)
            return video_id, youtube_id, True

async def run_health_check(dry_run: bool = False):
    db = SessionLocal()
    try:
        videos = db.query(Video).filter(Video.is_unavailable == False).all()
        print(f"🔍 Checking {len(videos)} active videos in database...")

        semaphore = asyncio.Semaphore(20) # 20 concurrent async requests
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

        async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
            tasks = [check_video_status(client, v.id, v.youtube_id, semaphore) for v in videos]
            results = await asyncio.gather(*tasks)

        unavailable_ids = [vid for vid, yid, is_active in results if not is_active]
        print(f"\n📊 [Health Check Results]")
        print(f"   - Total Checked: {len(videos)}")
        print(f"   - Active Videos: {len(videos) - len(unavailable_ids)}")
        print(f"   - Unavailable / Private / Deleted Videos: {len(unavailable_ids)}")

        if unavailable_ids:
            print(f"   - Identified Unavailable Video IDs: {unavailable_ids[:20]}...")
            if not dry_run:
                db.query(Video).filter(Video.id.in_(unavailable_ids)).update(
                    {Video.is_unavailable: True},
                    synchronize_session=False
                )
                db.commit()
                print(f"   ✅ Successfully marked {len(unavailable_ids)} videos as is_unavailable=True in DB!")
            else:
                print("   ℹ️ [DRY RUN] No database changes made.")
    finally:
        db.close()

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(run_health_check(dry_run=dry))
