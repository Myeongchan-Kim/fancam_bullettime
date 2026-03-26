import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Video, Song, Contribution

# Use absolute path for DB to avoid confusion
db_path = os.path.join(os.getcwd(), "backend", "twice_fancam.db")
DATABASE_URL = f"sqlite:///{db_path}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    print("Checking Song.is_solo...")
    songs = db.query(Song).limit(5).all()
    if not songs:
        print("No songs found in the database.")
    for s in songs:
        print(f"Song: {s.name}, is_solo: {s.is_solo} (type: {type(s.is_solo)})")
        assert isinstance(s.is_solo, bool)

    print("\nChecking Video.members...")
    videos = db.query(Video).filter(Video.members != None).limit(5).all()
    if not videos:
        print("No videos found in the database.")
    for v in videos:
        print(f"Video: {v.title}, members: {v.members} (type: {type(v.members)})")
        assert isinstance(v.members, list)

    print("\nChecking Contribution.suggested_members...")
    contribs = db.query(Contribution).filter(Contribution.suggested_members != None).limit(5).all()
    if not contribs:
        print("No contributions found in the database.")
    for c in contribs:
        print(f"Contribution ID: {c.id}, suggested_members: {c.suggested_members} (type: {type(c.suggested_members)})")
        assert isinstance(c.suggested_members, list)

    print("\nVerification successful!")
finally:
    db.close()
