import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, selectinload, joinedload
from app.models.models import Concert, ConcertSetlist, Song

# Since we run this from within 'backend' folder
DATABASE_URL = "sqlite:///./twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    print("Testing get_concerts query logic...")
    results = db.query(Concert).options(
        selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
    ).order_by(Concert.date.desc()).limit(1).all()
    
    for c in results:
        print(f"Concert: {c.city}, Setlist length: {len(c.setlist)}")
    print("Query successful!")
except Exception as e:
    print(f"Query failed: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
