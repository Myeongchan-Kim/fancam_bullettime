import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./twice_fancam.db")

def migrate():
    engine = create_engine(DATABASE_URL)
    
    print(f"Connecting to {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
    
    with engine.connect() as conn:
        # Check if columns exist first (to make it idempotent)
        if "postgresql" in DATABASE_URL:
            # PostgreSQL specific check
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='contributions' AND column_name='suggested_setlist_id';
            """)
            result = conn.execute(check_query).fetchone()
            
            if not result:
                print("Adding columns to PostgreSQL...")
                conn.execute(text("ALTER TABLE contributions ADD COLUMN suggested_setlist_id INTEGER;"))
                conn.execute(text("ALTER TABLE contributions ADD COLUMN suggested_start_time FLOAT;"))
                conn.commit()
                print("Columns added successfully.")
            else:
                print("Columns already exist.")
        else:
            # SQLite (for local dev if needed)
            try:
                conn.execute(text("ALTER TABLE contributions ADD COLUMN suggested_setlist_id INTEGER;"))
                conn.execute(text("ALTER TABLE contributions ADD COLUMN suggested_start_time FLOAT;"))
                conn.commit()
                print("Columns added to SQLite.")
            except Exception as e:
                print(f"Could not add columns (maybe they exist?): {e}")

if __name__ == "__main__":
    migrate()
