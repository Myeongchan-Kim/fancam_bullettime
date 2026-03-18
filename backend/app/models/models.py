from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Enum, JSON
from sqlalchemy.orm import relationship, declarative_base
import datetime
import enum

Base = declarative_base()

class AngleType(str, enum.Enum):
    NORTH = "North (Front)"
    SOUTH = "South (Back)"
    EAST = "East (Right)"
    WEST = "West (Left)"
    TOP = "Top"
    FLOOR = "Floor"
    UNKNOWN = "Unknown"

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    youtube_id = Column(String, unique=True, index=True)
    title = Column(String)
    thumbnail_url = Column(String)
    url = Column(String)
    
    # Labeling
    song_id = Column(Integer, ForeignKey("songs.id"))
    concert_id = Column(Integer, ForeignKey("concerts.id"))
    members = Column(JSON) # List of member names
    
    # Multi-Angle & Sync
    angle = Column(String, default=AngleType.UNKNOWN)
    coordinate_x = Column(Float, nullable=True)
    coordinate_y = Column(Float, nullable=True)
    sync_offset = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    song = relationship("Song", back_populates="videos")
    concert = relationship("Concert", back_populates="videos")
    contributions = relationship("Contribution", back_populates="video")

class Song(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    order = Column(Integer, nullable=True)
    is_solo = Column(Boolean, default=False)
    member_name = Column(String, nullable=True) # if solo
    
    videos = relationship("Video", back_populates="song")

class Concert(Base):
    __tablename__ = "concerts"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, index=True)
    city = Column(String)
    country = Column(String)
    venue = Column(String)
    
    videos = relationship("Video", back_populates="concert")

class Contribution(Base):
    __tablename__ = "contributions"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"))
    
    # Metadata suggestions
    suggested_title = Column(String, nullable=True)
    suggested_song_id = Column(Integer, ForeignKey("songs.id"), nullable=True)
    suggested_concert_id = Column(Integer, ForeignKey("concerts.id"), nullable=True)
    suggested_members = Column(JSON, nullable=True)
    
    # Location & Sync suggestions
    suggested_angle = Column(String, nullable=True)
    suggested_coordinate_x = Column(Float, nullable=True)
    suggested_coordinate_y = Column(Float, nullable=True)
    suggested_sync_offset = Column(Float, nullable=True)
    
    user_ip = Column(String) # For basic anti-spam
    is_processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    video = relationship("Video", back_populates="contributions")
