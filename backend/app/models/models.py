from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Enum, JSON, Table, TypeDecorator
from sqlalchemy.orm import relationship, declarative_base
import datetime
import enum
import json

Base = declarative_base()

class JSONEncodedList(TypeDecorator):
    """Enables JSON storage of lists/dicts by automatic string conversion."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            return json.loads(value)
        return None

video_song_association = Table(
    'video_song_association',
    Base.metadata,
    Column('video_id', Integer, ForeignKey('videos.id'), primary_key=True),
    Column('song_id', Integer, ForeignKey('songs.id'), primary_key=True)
)

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
    description = Column(String, nullable=True) # Full description for AI parsing
    thumbnail_url = Column(String)
    url = Column(String)
    
    # Labeling
    song_id = Column(Integer, ForeignKey("songs.id"), index=True)
    concert_id = Column(Integer, ForeignKey("concerts.id"), index=True)
    members = Column(JSONEncodedList) # List of member names
    
    # Multi-Angle & Sync
    angle = Column(String, default=AngleType.UNKNOWN)
    coordinate_x = Column(Float, nullable=True)
    coordinate_y = Column(Float, nullable=True)
    sync_offset = Column(Float, default=0.0)
    duration = Column(Float, default=9999.0, index=True) # in seconds
    is_shorts = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC), index=True)
    
    # Relationships
    song = relationship("Song", foreign_keys=[song_id], back_populates="videos", overlaps="songs,videos_list") # Deprecated
    songs = relationship("Song", secondary=video_song_association, back_populates="videos_list", lazy="selectin")
    concert = relationship("Concert", back_populates="videos", lazy="joined")
    contributions = relationship("Contribution", back_populates="video", lazy="select")
    sync_segments = relationship("VideoSyncSegment", back_populates="video", cascade="all, delete-orphan", order_by=lambda: VideoSyncSegment.video_start_time, lazy="selectin")

class Song(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    order = Column(Integer, nullable=True, index=True)
    is_solo = Column(Boolean, nullable=False, default=False)
    member_name = Column(String, nullable=True) # if solo
    
    # Visual Sync & Stage Costume Metadata
    act = Column(String, nullable=True, index=True)           # e.g. "Act 1 (Opening)", "Act 2 (Solo)", "Act 3 (Hits)", "Act 4 (Encore)"
    stage_outfit = Column(String, nullable=True)              # e.g. "블랙 레더 & 메탈릭 전사 룩 / 롱부츠"
    visual_notes = Column(String, nullable=True)              # e.g. "불꽃 특수효과, 다크 배경, 붉은 레이저"
    description = Column(String, nullable=True)               # e.g. "오프닝 타이틀 트랙"
    
    videos = relationship("Video", back_populates="song", overlaps="songs,videos_list") # Deprecated
    videos_list = relationship("Video", secondary=video_song_association, back_populates="songs", lazy="select")

class Concert(Base):
    __tablename__ = "concerts"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, index=True)
    city = Column(String)
    country = Column(String)
    venue = Column(String)
    
    videos = relationship("Video", back_populates="concert", lazy="select")
    setlist = relationship("ConcertSetlist", back_populates="concert", order_by=lambda: ConcertSetlist.display_order, lazy="selectin")

class ConcertSetlist(Base):
    __tablename__ = "concert_setlists"
    id = Column(Integer, primary_key=True, index=True)
    concert_id = Column(Integer, ForeignKey("concerts.id"), index=True)
    
    # Linked to Song if it's a performance, nullable for non-song events (Talk, Intro, etc.)
    song_id = Column(Integer, ForeignKey("songs.id"), nullable=True)
    
    # Custom name for events (e.g., "TALK 1", "Photo Time") or fallback title
    event_name = Column(String, nullable=True) 
    
    # Start time in seconds relative to the "Full Concert" version
    start_time = Column(Float, index=True, nullable=True) 
    
    # Order in the setlist
    display_order = Column(Integer, index=True)

    concert = relationship("Concert", back_populates="setlist")
    song = relationship("Song", lazy="joined")

class Contribution(Base):
    __tablename__ = "contributions"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=True)
    suggested_url = Column(String, nullable=True)
    
    # Metadata suggestions
    suggested_title = Column(String, nullable=True)
    suggested_song_id = Column(Integer, ForeignKey("songs.id"), nullable=True) # Deprecated
    suggested_song_ids = Column(JSONEncodedList, nullable=True)
    suggested_concert_id = Column(Integer, ForeignKey("concerts.id"), nullable=True)
    suggested_members = Column(JSONEncodedList, nullable=True)
    suggested_duration = Column(Float, default=9999.0)
    suggested_is_shorts = Column(Boolean, default=False)
    
    # Location & Sync suggestions
    suggested_angle = Column(String, nullable=True)
    suggested_coordinate_x = Column(Float, nullable=True)
    suggested_coordinate_y = Column(Float, nullable=True)
    suggested_sync_offset = Column(Float, nullable=True)
    
    # Setlist timing suggestions
    suggested_setlist_id = Column(Integer, ForeignKey("concert_setlists.id"), nullable=True)
    suggested_start_time = Column(Float, nullable=True)
    suggested_event_name = Column(String, nullable=True)
    
    user_ip = Column(String) # For basic anti-spam
    is_processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC))
    
    video = relationship("Video", back_populates="contributions", lazy="joined")

class VideoSyncSegment(Base):
    __tablename__ = "video_sync_segments"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # Linked to ConcertSetlist if applicable
    setlist_id = Column(Integer, ForeignKey("concert_setlists.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Video timestamp range (in seconds)
    video_start_time = Column(Float, nullable=False)
    video_end_time = Column(Float, nullable=False)
    
    # Master Concert timeline timestamp range (in seconds)
    master_start_time = Column(Float, nullable=False)
    master_end_time = Column(Float, nullable=False)
    
    # Offset for this segment: master_start_time - video_start_time
    sync_offset = Column(Float, nullable=False)
    
    # Metadata / label (e.g., song title, act name, or note)
    label = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.UTC))
    
    video = relationship("Video", back_populates="sync_segments")
    setlist = relationship("ConcertSetlist", lazy="joined")
