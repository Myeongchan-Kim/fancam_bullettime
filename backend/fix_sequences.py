import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
    print("❌ This script is intended for PostgreSQL databases only.")
    exit(1)

engine = create_engine(DATABASE_URL)

def fix_sequences():
    tables = ["videos", "songs", "concerts", "contributions", "concert_setlists"]
    
    with engine.connect() as conn:
        print(f"🚀 Synchronizing sequences for {len(tables)} tables...")
        for table in tables:
            try:
                # This SQL command updates the sequence to match the current max(id)
                # It prevents 'duplicate key value violates unique constraint' errors
                query = text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), coalesce(max(id), 0) + 1, false) FROM {table};")
                conn.execute(query)
                conn.commit()
                print(f"✅ Sequence synchronized for table: {table}")
            except Exception as e:
                print(f"⚠️ Failed to sync sequence for {table}: {e}")

if __name__ == "__main__":
    fix_sequences()
    print("✨ All sequences updated.")
