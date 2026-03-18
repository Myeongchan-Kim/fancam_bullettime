import sqlite3

def migrate():
    conn = sqlite3.connect('backend/twice_fancam.db')
    cursor = conn.cursor()
    
    # Add 'order' column to songs table
    try:
        cursor.execute("ALTER TABLE songs ADD COLUMN 'order' INTEGER")
        print("Added 'order' to songs")
    except sqlite3.OperationalError:
        print("'order' already exists in songs")
        
    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
