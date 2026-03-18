import sqlite3

def migrate():
    conn = sqlite3.connect('backend/twice_fancam.db')
    cursor = conn.cursor()
    
    # Add columns to videos table
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN coordinate_x FLOAT")
        print("Added coordinate_x to videos")
    except sqlite3.OperationalError:
        print("coordinate_x already exists in videos")
        
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN coordinate_y FLOAT")
        print("Added coordinate_y to videos")
    except sqlite3.OperationalError:
        print("coordinate_y already exists in videos")
        
    # Add columns to angle_suggestions table
    try:
        cursor.execute("ALTER TABLE angle_suggestions ADD COLUMN suggested_coordinate_x FLOAT")
        print("Added suggested_coordinate_x to angle_suggestions")
    except sqlite3.OperationalError:
        print("suggested_coordinate_x already exists in angle_suggestions")
        
    try:
        cursor.execute("ALTER TABLE angle_suggestions ADD COLUMN suggested_coordinate_y FLOAT")
        print("Added suggested_coordinate_y to angle_suggestions")
    except sqlite3.OperationalError:
        print("suggested_coordinate_y already exists in angle_suggestions")
        
    conn.commit()
    conn.close()
    print("Migration completed.")

if __name__ == "__main__":
    migrate()
