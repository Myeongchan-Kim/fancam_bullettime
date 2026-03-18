import sqlite3

def migrate():
    conn = sqlite3.connect('backend/twice_fancam.db')
    cursor = conn.cursor()
    
    # 1. Rename table if exists
    try:
        cursor.execute("ALTER TABLE angle_suggestions RENAME TO contributions")
        print("Renamed angle_suggestions to contributions")
    except sqlite3.OperationalError:
        print("contributions table already exists or angle_suggestions does not exist")
        
    # 2. Add new metadata suggestion columns
    new_cols = [
        ("suggested_title", "TEXT"),
        ("suggested_song_id", "INTEGER"),
        ("suggested_concert_id", "INTEGER"),
        ("suggested_members", "JSON")
    ]
    
    for col_name, col_type in new_cols:
        try:
            cursor.execute(f"ALTER TABLE contributions ADD COLUMN {col_name} {col_type}")
            print(f"Added {col_name} to contributions")
        except sqlite3.OperationalError:
            print(f"{col_name} already exists in contributions")
            
    conn.commit()
    conn.close()
    print("Migration to full Contribution model completed.")

if __name__ == "__main__":
    migrate()
