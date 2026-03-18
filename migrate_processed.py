import sqlite3

def migrate():
    conn = sqlite3.connect('backend/twice_fancam.db')
    cursor = conn.cursor()
    
    # Add is_processed column to angle_suggestions table
    try:
        cursor.execute("ALTER TABLE angle_suggestions ADD COLUMN is_processed BOOLEAN DEFAULT 0")
        print("Added is_processed to angle_suggestions")
    except sqlite3.OperationalError:
        print("is_processed already exists in angle_suggestions")
        
    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
