import sqlite3
import os

db_path = "/Users/mckim/projects/tmp/twice_concert_crawling/backend/twice_fancam.db"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Update NULLs to False (0 in SQLite)
    cursor.execute("UPDATE songs SET is_solo = 0 WHERE is_solo IS NULL")
    print(f"Updated {cursor.rowcount} rows in 'songs' table.")
    conn.commit()
except Exception as e:
    print(f"Error during migration: {e}")
    conn.rollback()
finally:
    conn.close()
