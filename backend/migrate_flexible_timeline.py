import sqlite3
import os

DB_PATH = "backend/twice_fancam.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Checking current contributions table schema...")
    cursor.execute("PRAGMA table_info(contributions)")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Current columns: {columns}")

    # Start transaction
    cursor.execute("BEGIN TRANSACTION")

    try:
        # Create new table with full schema
        print("Creating contributions_new table...")
        cursor.execute("""
            CREATE TABLE contributions_new (
                id INTEGER NOT NULL, 
                video_id INTEGER, 
                suggested_url VARCHAR,
                suggested_title VARCHAR,
                suggested_song_id INTEGER,
                suggested_song_ids TEXT, -- JSONEncodedList is String
                suggested_concert_id INTEGER,
                suggested_members TEXT, -- JSONEncodedList is String
                suggested_duration FLOAT DEFAULT 9999.0,
                suggested_is_shorts BOOLEAN DEFAULT 0,
                suggested_angle VARCHAR, 
                suggested_coordinate_x FLOAT, 
                suggested_coordinate_y FLOAT, 
                suggested_sync_offset FLOAT, 
                suggested_setlist_id INTEGER,
                suggested_start_time FLOAT,
                suggested_event_name VARCHAR,
                user_ip VARCHAR, 
                is_processed BOOLEAN DEFAULT 0, 
                created_at DATETIME, 
                PRIMARY KEY (id), 
                FOREIGN KEY(video_id) REFERENCES videos (id),
                FOREIGN KEY(suggested_song_id) REFERENCES songs (id),
                FOREIGN KEY(suggested_concert_id) REFERENCES concerts (id),
                FOREIGN KEY(suggested_setlist_id) REFERENCES concert_setlists (id)
            )
        """)

        # Identify common columns for data migration
        common_cols = [
            "id", "video_id", "suggested_url", "suggested_title", 
            "suggested_song_id", "suggested_song_ids", "suggested_concert_id", 
            "suggested_members", "suggested_duration", "suggested_is_shorts", 
            "suggested_angle", "suggested_coordinate_x", "suggested_coordinate_y", 
            "suggested_sync_offset", "user_ip", "is_processed", "created_at"
        ]
        
        # Filter columns that actually exist in the old table
        existing_common_cols = [col for col in common_cols if col in columns]
        cols_str = ", ".join(existing_common_cols)

        print(f"Migrating data from contributions to contributions_new for columns: {existing_common_cols}")
        cursor.execute(f"INSERT INTO contributions_new ({cols_str}) SELECT {cols_str} FROM contributions")

        # Drop old table and rename new table
        print("Dropping old contributions table and renaming contributions_new...")
        cursor.execute("DROP TABLE contributions")
        cursor.execute("ALTER TABLE contributions_new RENAME TO contributions")

        # Re-create indexes
        print("Re-creating indexes for contributions...")
        cursor.execute("CREATE INDEX ix_contributions_id ON contributions (id)")
        
        # Commit transaction
        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
