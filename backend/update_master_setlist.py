import os
import sys

# Add the app directory to sys.path so we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import SessionLocal
from app.models.models import Song

def run_migration():
    db = SessionLocal()
    
    # Define the new master timeline order
    # Each item is a tuple: (Song Name, is_solo, member_name)
    master_timeline = [
        ("FOUR (Intro)", False, None),
        ("THIS IS FOR", False, None),
        ("Strategy", False, None),
        ("MAKE ME GO", False, None),
        ("SET ME FREE", False, None),
        ("I CAN'T STOP ME", False, None),
        ("TALK 1", False, None),
        ("OPTIONS", False, None),
        ("MOONLIGHT SUNRISE", False, None),
        ("MARS", False, None),
        ("I GOT YOU", False, None),
        ("The Feels", False, None),
        ("TALK 2", False, None),
        ("DAT AHH DAT OOH", False, None),
        ("BATTITUDE", False, None),
        ("Gone", False, None),
        ("CRY FOR ME", False, None),
        ("HELL IN HEAVEN", False, None),
        ("RIGHT HAND GIRL", False, None),
        ("RUN AWAY (TZUYU Solo)", True, "Tzuyu"),
        ("DIVE IN", True, "Tzuyu"),
        ("STONE COLD", True, "Mina"),
        ("MEEEEEE", True, "Nayeon"),
        ("FIX A DRINK", True, "Jeongyeon"),
        ("SHOOT (Firecracker)", True, "Chaeyoung"),
        ("ATM", True, "Jihyo"),
        ("DECAFFEINATED", True, "Sana"),
        ("MOVE LIKE THAT", True, "Momo"),
        ("CHESS", True, "Dahyun"),
        ("IN MY ROOM", True, "Chaeyoung"),
        ("TAKEDOWN", False, None),
        ("FANCY (Rock ver.)", False, None),
        ("What Is Love? (Rock ver.)", False, None),
        ("YES or YES (Rock ver.)", False, None),
        ("Dance the Night Away (Rock ver.)", False, None),
        ("TALK 3", False, None),
        ("ONE SPARK", False, None),
        ("THIS IS FOR ONCE", False, None),
        ("Family Cam (子瑜媽 彩瑛媽 桃子姐)", False, None),
        ("Feel Special", False, None),
        ("SCIENTIST", False, None),
        ("LIKEY", False, None),
        ("BDZ (Korean ver.)", False, None),
        ("TALK 4", False, None),
        ("Photo Time", False, None),
        ("TZUYU's TALK", False, None),
        ("TWICE Song (Encore)", False, None),
        ("TWICE Song Ballad version", False, None),
        ("Take a bow with dancers & Band", False, None),
        ("RUN AWAY (Encore)", False, None),
        ("Cheer Up", False, None),
        ("TT", False, None),
        ("Knock Knock", False, None),
        ("SIGNAL", False, None),
        ("Like OOH-AHH", False, None),
        ("Heart Shaker", False, None),
        ("Talk that Talk", False, None),
        ("THE END", False, None)
    ]

    try:
        print("Starting Master Setlist Migration...")
        # Get all existing songs
        existing_songs = {s.name: s for s in db.query(Song).all()}
        
        # Iterate through master timeline and update/create
        for i, (name, is_solo, member_name) in enumerate(master_timeline):
            order = i + 1
            
            # Name normalization for checking
            if name in existing_songs:
                song = existing_songs[name]
                song.order = order
                print(f"Updated existing: [{order}] {name}")
            else:
                new_song = Song(
                    name=name,
                    order=order,
                    is_solo=is_solo,
                    member_name=member_name
                )
                db.add(new_song)
                print(f"Added new: [{order}] {name}")
                
        db.commit()
        print("Migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()