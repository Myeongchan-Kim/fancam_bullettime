import sys
import os
import logging
from sqlalchemy import text
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.db import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def migrate():
    new_columns = [
        ("act", "VARCHAR"),
        ("stage_outfit", "VARCHAR"),
        ("visual_notes", "TEXT"),
        ("description", "TEXT")
    ]
    
    with engine.connect() as conn:
        for col_name, col_type in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE songs ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                logger.info(f"✅ Added column 'songs.{col_name}' successfully.")
            except Exception as e:
                logger.info(f"ℹ️ Column 'songs.{col_name}' already exists or skipped: {e}")

if __name__ == "__main__":
    migrate()
