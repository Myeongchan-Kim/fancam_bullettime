import os
import sys

# Add the app directory to sys.path so we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.main import SessionLocal
from app.models.models import Concert, ConcertSetlist, Video, Song

def normalize_timestamps():
    db = SessionLocal()
    try:
        concerts = db.query(Concert).all()
        print(f"Found {len(concerts)} concerts to process.")

        for concert in concerts:
            print(f"\nProcessing concert: {concert.city} ({concert.date})")
            
            # Find the "THIS IS FOR" setlist entry
            offset_item = db.query(ConcertSetlist).join(Song, ConcertSetlist.song_id == Song.id, isouter=True).filter(
                ConcertSetlist.concert_id == concert.id,
                ((Song.name == "THIS IS FOR") | (ConcertSetlist.event_name == "THIS IS FOR"))
            ).first()

            if not offset_item:
                print("  'THIS IS FOR' not found in setlist. Skipping normalization for this concert.")
                continue

            if offset_item.start_time is None:
                print("  'THIS IS FOR' has no start_time. Skipping normalization.")
                continue

            T_offset = offset_item.start_time
            print(f"  Found 'THIS IS FOR' at {T_offset}s. Normalizing...")

            if T_offset == 0:
                print("  T_offset is already 0. No changes needed for setlist/videos.")
                continue

            # 1. Update ConcertSetlist start_times
            updated_setlist_count = 0
            for item in concert.setlist:
                if item.start_time is not None:
                    item.start_time -= T_offset
                    updated_setlist_count += 1
            
            print(f"  Updated {updated_setlist_count} setlist items.")

            # 2. Update Video sync_offsets
            videos = db.query(Video).filter(Video.concert_id == concert.id).all()
            updated_video_count = 0
            for video in videos:
                # video.sync_offset is default 0.0, never None in model
                video.sync_offset -= T_offset
                updated_video_count += 1
            
            print(f"  Updated {updated_video_count} videos.")

        db.commit()
        print("\nNormalization completed and committed successfully!")

    except Exception as e:
        db.rollback()
        print(f"\nNormalization failed: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    normalize_timestamps()
