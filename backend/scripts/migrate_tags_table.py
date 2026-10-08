import sys
import os
import json
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.db import engine
from app.models.models import Base, Tag, Video, video_tag_association

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def ensure_list(data):
    if data is None:
        return []
    current = data
    for _ in range(5):
        if isinstance(current, list):
            return current
        if not isinstance(current, str):
            break
        try:
            current = json.loads(current)
        except (json.JSONDecodeError, TypeError):
            break
    if not isinstance(current, list):
        return []
    return current

def migrate():
    logger.info("🚀 Starting Tag Table and Video-Tag Association Migration...")

    # 1. Ensure tables exist in DB (works on both PostgreSQL and SQLite)
    logger.info("Creating 'tags' and 'video_tag_association' tables if they do not exist...")
    Base.metadata.create_all(bind=engine, tables=[Tag.__table__, video_tag_association], checkfirst=True)
    logger.info("✅ Tables verified/created.")

    # 2. Migrate existing video.members data into tags and associations
    with Session(engine) as session:
        videos = session.query(Video).filter(Video.members.isnot(None)).all()
        logger.info(f"Found {len(videos)} videos with non-null members column to inspect.")

        tag_cache = {t.name: t for t in session.query(Tag).all()}
        new_tags_count = 0
        associations_count = 0

        for v in videos:
            member_names = ensure_list(v.members)
            if not member_names:
                continue

            for raw_name in member_names:
                if not raw_name or not isinstance(raw_name, str):
                    continue
                name = raw_name.strip()
                if not name:
                    continue

                # Get or create Tag
                if name not in tag_cache:
                    new_tag = Tag(name=name, category="artist")
                    session.add(new_tag)
                    session.flush()
                    tag_cache[name] = new_tag
                    new_tags_count += 1
                
                tag = tag_cache[name]

                # Check if association already exists
                exists = session.execute(
                    text("SELECT 1 FROM video_tag_association WHERE video_id = :vid AND tag_id = :tid"),
                    {"vid": v.id, "tid": tag.id}
                ).fetchone()

                if not exists:
                    session.execute(
                        video_tag_association.insert().values(video_id=v.id, tag_id=tag.id)
                    )
                    associations_count += 1

        session.commit()
        logger.info(f"🎉 Migration Complete: {new_tags_count} new tags created, {associations_count} video-tag associations linked.")

if __name__ == "__main__":
    migrate()
