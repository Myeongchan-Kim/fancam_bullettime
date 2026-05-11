import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    if not DATABASE_URL or "postgresql" not in DATABASE_URL:
        print("DATABASE_URL is not set or not a PostgreSQL URL. Skipping Supabase migration.")
        return

    engine = create_engine(DATABASE_URL)
    print(f"Connecting to Supabase PostgreSQL...")
    
    with engine.connect() as conn:
        # Table: contributions
        print("\nChecking 'contributions' table...")
        columns_to_add_contrib = [
            ("suggested_url", "VARCHAR"),
            ("suggested_title", "VARCHAR"),
            ("suggested_song_id", "INTEGER"),
            ("suggested_song_ids", "TEXT"),
            ("suggested_concert_id", "INTEGER"),
            ("suggested_members", "TEXT"),
            ("suggested_duration", "DOUBLE PRECISION"),
            ("suggested_is_shorts", "BOOLEAN"),
            ("suggested_angle", "VARCHAR"),
            ("suggested_coordinate_x", "DOUBLE PRECISION"),
            ("suggested_coordinate_y", "DOUBLE PRECISION"),
            ("suggested_sync_offset", "DOUBLE PRECISION"),
            ("suggested_setlist_id", "INTEGER"),
            ("suggested_start_time", "DOUBLE PRECISION"),
            ("suggested_event_name", "VARCHAR")
        ]
        for col_name, col_type in columns_to_add_contrib:
            check_query = text(f"SELECT column_name FROM information_schema.columns WHERE table_name='contributions' AND column_name='{col_name}';")
            result = conn.execute(check_query).fetchone()
            if not result:
                print(f"Adding column {col_name} ({col_type}) to contributions table...")
                conn.execute(text(f"ALTER TABLE contributions ADD COLUMN {col_name} {col_type};"))
                conn.commit()
            else:
                print(f"Column {col_name} already exists.")

        # Table: concert_setlists
        print("\nChecking 'concert_setlists' table...")
        columns_to_add_setlist = [
            ("event_name", "VARCHAR"),
            ("start_time", "DOUBLE PRECISION")
        ]
        for col_name, col_type in columns_to_add_setlist:
            check_query = text(f"SELECT column_name FROM information_schema.columns WHERE table_name='concert_setlists' AND column_name='{col_name}';")
            result = conn.execute(check_query).fetchone()
            if not result:
                print(f"Adding column {col_name} ({col_type}) to concert_setlists table...")
                conn.execute(text(f"ALTER TABLE concert_setlists ADD COLUMN {col_name} {col_type};"))
                conn.commit()
            else:
                print(f"Column {col_name} already exists. Ensuring it's nullable...")
                conn.execute(text(f"ALTER TABLE concert_setlists ALTER COLUMN {col_name} DROP NOT NULL;"))
                conn.commit()

    print("\nSupabase migration check complete.")

if __name__ == "__main__":
    migrate()
