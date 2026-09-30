import os
import sys
import logging
from sqlalchemy import text
from app.db import engine
import yt_dlp

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def probe_video_dimension(youtube_id: str):
    """Probes the true stream resolution and aspect ratio using yt-dlp."""
    ydl_opts = {'skip_download': True, 'quiet': True, 'extract_flat': False}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'https://www.youtube.com/watch?v={youtube_id}', download=False)
            width = info.get('width')
            height = info.get('height')
            aspect_ratio = info.get('aspect_ratio')
            if width and height:
                if not aspect_ratio:
                    aspect_ratio = round(float(width) / float(height), 4)
                return width, height, aspect_ratio
    except Exception as e:
        logger.warning(f"Failed to probe {youtube_id}: {e}")
    return None, None, None

def probe_and_update_batch(limit: int = 50):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, youtube_id, title FROM videos WHERE width IS NULL OR aspect_ratio IS NULL LIMIT :limit"),
            {"limit": limit}
        ).fetchall()
        
        logger.info(f"Probing {len(rows)} videos for dimensions...")
        for row in rows:
            v_id, yt_id, title = row[0], row[1], row[2]
            w, h, ar = probe_video_dimension(yt_id)
            if w and h:
                conn.execute(
                    text("UPDATE videos SET width = :w, height = :h, aspect_ratio = :ar WHERE id = :id"),
                    {"w": w, "h": h, "ar": ar, "id": v_id}
                )
                logger.info(f"✅ Updated {yt_id} ({title[:30]}): {w}x{h} (ar: {ar})")
        conn.commit()

if __name__ == '__main__':
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    probe_and_update_batch(limit)
