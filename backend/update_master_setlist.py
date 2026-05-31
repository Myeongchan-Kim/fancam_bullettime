import os
import sys

# Add the app directory to sys.path so we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import SessionLocal
from app.models.models import Song, video_song_association

def run_migration():
    db = SessionLocal()
    
    # Define the new master timeline order
    # (Song Name, is_solo, member_name)
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
        ("Gone", False, None),
        ("CRY FOR ME", False, None),
        ("HELL IN HEAVEN", False, None),
        ("RIGHT HAND GIRL", False, None),
        ("TALK 2", False, None),
        ("RUN AWAY (Solo) (Taipei Only)", True, "Tzuyu"),
        ("DIVE IN (Solo)", True, "Tzuyu"),
        ("STONE COLD (Solo)", True, "Mina"),
        ("MEEEEEE (Solo)", True, "Nayeon"),
        ("FIX A DRINK (Solo)", True, "Jeongyeon"),
        ("SHOOT (Firecracker)", True, "Chaeyoung"),
        ("ATM (Solo)", True, "Jihyo"),
        ("DECAFFEINATED (Solo)", True, "Sana"),
        ("MOVE LIKE THAT (Solo)", True, "Momo"),
        ("DAT AHH DAT OOH", False, None),
        ("BATTITUDE", False, None),
        ("CHESS (Solo)", True, "Dahyun"),
        ("IN MY ROOM (Solo)", True, "Chaeyoung"),
        ("TAKEDOWN", False, None),
        ("TALK 3", False, None),
        ("FANCY", False, None),
        ("What Is Love?", False, None),
        ("YES or YES", False, None),
        ("Dance the Night Away", False, None),
        ("TALK 4", False, None),
        ("ONE SPARK", False, None),
        ("THIS IS FOR ONCE", False, None),
        ("Family Cam (Taipei Only)", False, None),
        ("Feel Special", False, None),
        ("TALK 5", False, None),
        ("Photo Time", False, None),
        ("TZUYU's TALK (Taipei Only)", False, None),
        ("SCIENTIST (Encore)", False, None),
        ("LIKEY (Encore)", False, None),
        ("BDZ (Encore)", False, None),
        ("Cheer Up (Encore)", False, None),
        ("TT (Encore)", False, None),
        ("Knock Knock (Encore)", False, None),
        ("SIGNAL (Encore)", False, None),
        ("Like OOH-AHH (Encore)", False, None),
        ("Heart Shaker (Encore)", False, None),
        ("Talk that Talk (Encore)", False, None),
        ("TWICE Song (Encore)", False, None),
        ("TWICE Song Ballad version (Encore)", False, None),
        ("Take a bow / Ending", False, None),
        ("THE END", False, None)
    ]

    # Mapping to help merge previously existing names to new labeled names
    rename_map = {
        "SCIENTIST": "SCIENTIST (Encore)",
        "LIKEY": "LIKEY (Encore)",
        "BDZ (Korean ver.)": "BDZ (Encore)",
        "Cheer Up": "Cheer Up (Encore)",
        "TT": "TT (Encore)",
        "Knock Knock": "Knock Knock (Encore)",
        "SIGNAL": "SIGNAL (Encore)",
        "Like OOH-AHH": "Like OOH-AHH (Encore)",
        "Heart Shaker": "Heart Shaker (Encore)",
        "Talk that Talk": "Talk that Talk (Encore)",
        "RUN AWAY (TZUYU Solo)": "RUN AWAY (Solo) (Taipei Only)",
        "DIVE IN": "DIVE IN (Solo)",
        "STONE COLD": "STONE COLD (Solo)",
        "MEEEEEE": "MEEEEEE (Solo)",
        "FIX A DRINK": "FIX A DRINK (Solo)",
        "CHESS": "CHESS (Solo)",
        "IN MY ROOM": "IN MY ROOM (Solo)",
        "ATM": "ATM (Solo)",
        "DECAFFEINATED": "DECAFFEINATED (Solo)",
        "MOVE LIKE THAT": "MOVE LIKE THAT (Solo)",
        "FANCY (Rock ver.)": "FANCY",
        "What Is Love? (Rock ver.)": "What Is Love?",
        "YES or YES (Rock ver.)": "YES or YES",
        "Dance the Night Away (Rock ver.)": "Dance the Night Away",
        "Take a bow with dancers & Band": "Take a bow / Ending",
        "TWICE Song Ballad version": "TWICE Song Ballad version (Encore)"
    }

    try:
        print("Starting Master Setlist Migration (Consolidated)...")
        
        # 0. Manual merge for known duplicates not in rename_map
        manual_merges = [
            (101, 41), # FOUR (Intro)
            (106, 38), # DAT AHH DAT OOH
            (107, 39), # BATTITUDE
        ]
        from app.models.models import Video, ConcertSetlist, Contribution
        from sqlalchemy import select
        
        for old_id, new_id in manual_merges:
            old_song = db.query(Song).filter(Song.id == old_id).first()
            new_song = db.query(Song).filter(Song.id == new_id).first()
            if old_song and new_song:
                print(f"Manually merging ID {old_id} into {new_id} ({old_song.name})...")
                subq = select(video_song_association.c.video_id).where(video_song_association.c.song_id == new_id)
                db.execute(
                    video_song_association.delete()
                    .where(video_song_association.c.song_id == old_id)
                    .where(video_song_association.c.video_id.in_(subq))
                )
                db.execute(
                    video_song_association.update()
                    .where(video_song_association.c.song_id == old_id)
                    .values(song_id=new_id)
                )
                db.query(Video).filter(Video.song_id == old_id).update({Video.song_id: new_id})
                db.query(ConcertSetlist).filter(ConcertSetlist.song_id == old_id).update({ConcertSetlist.song_id: new_id})
                db.query(Contribution).filter(Contribution.suggested_song_id == old_id).update({Contribution.suggested_song_id: new_id})
                db.delete(old_song)
        db.flush()

        # 1. Rename existing songs based on the map
        for old_name, new_name in rename_map.items():
            old_song = db.query(Song).filter(Song.name == old_name).first()
            if old_song:
                new_song_exists = db.query(Song).filter(Song.name == new_name).filter(Song.id != old_song.id).first()
                if new_song_exists:
                    # MERGE: Move video associations
                    print(f"Merging '{old_name}' into existing '{new_name}'...")
                    
                    # 1. First delete associations from old_song that already exist for new_song
                    # to avoid duplicate key errors on the composite primary key (video_id, song_id)
                    from sqlalchemy import delete, select
                    
                    subq = select(video_song_association.c.video_id).where(video_song_association.c.song_id == new_song_exists.id)
                    db.execute(
                        video_song_association.delete()
                        .where(video_song_association.c.song_id == old_song.id)
                        .where(video_song_association.c.video_id.in_(subq))
                    )
                    
                    # 2. Update remaining associations to the new song ID
                    db.execute(
                        video_song_association.update()
                        .where(video_song_association.c.song_id == old_song.id)
                        .values(song_id=new_song_exists.id)
                    )
                    
                    # 3. Update deprecated song_id in Video table if any
                    from app.models.models import Video, ConcertSetlist, Contribution
                    db.query(Video).filter(Video.song_id == old_song.id).update({Video.song_id: new_song_exists.id})
                    
                    # 4. Update ConcertSetlist references
                    db.query(ConcertSetlist).filter(ConcertSetlist.song_id == old_song.id).update({ConcertSetlist.song_id: new_song_exists.id})
                    
                    # 5. Update Contribution references
                    db.query(Contribution).filter(Contribution.suggested_song_id == old_song.id).update({Contribution.suggested_song_id: new_song_exists.id})
                    
                    db.delete(old_song)
                else:
                    print(f"Renaming '{old_name}' to '{new_name}'...")
                    old_song.name = new_name
        
        db.flush()

        # 2. Reset all orders to NULL to avoid collisions
        db.query(Song).update({Song.order: None})
        db.flush()

        # 3. Apply the master timeline
        existing_songs = {s.name: s for s in db.query(Song).all()}
        for i, (name, is_solo, member_name) in enumerate(master_timeline):
            order = i + 1
            if name in existing_songs:
                song = existing_songs[name]
                song.order = order
                song.is_solo = is_solo
                song.member_name = member_name
                print(f"Updated: [{order}] {name}")
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
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
