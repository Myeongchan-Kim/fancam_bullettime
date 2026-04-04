from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SongBase(BaseModel):
    id: int
    name: str
    order: Optional[int] = None
    is_solo: bool = False
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class ConcertSetlistBase(BaseModel):
    id: int
    concert_id: int
    song_id: Optional[int] = None
    event_name: Optional[str] = None
    start_time: Optional[float] = None
    display_order: int
    song: Optional[SongBase] = None

    class Config:
        from_attributes = True

class ConcertBase(BaseModel):
    id: int
    date: datetime
    city: str
    country: str
    venue: str
    setlist: List[ConcertSetlistBase] = []

    class Config:
        from_attributes = True

class VideoBase(BaseModel):
    id: int
    youtube_id: str
    title: str
    thumbnail_url: str
    url: str
    song_id: Optional[int] = None # Deprecated
    concert_id: Optional[int] = None
    members: List[str]
    angle: str
    coordinate_x: Optional[float] = None
    coordinate_y: Optional[float] = None
    sync_offset: float
    duration: float
    created_at: datetime

    class Config:
        from_attributes = True

class VideoDetail(VideoBase):
    song: Optional[SongBase] = None # Deprecated
    songs: List[SongBase] = []
    concert: Optional[ConcertBase] = None

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    song_id: Optional[int] = None # Deprecated
    song_ids: Optional[List[int]] = None
    concert_id: Optional[int] = None
    members: Optional[List[str]] = None
    angle: Optional[str] = None
    coordinate_x: Optional[float] = None
    coordinate_y: Optional[float] = None
    sync_offset: Optional[float] = None
    duration: Optional[float] = None

class ContributionCreate(BaseModel):
    video_id: Optional[int] = None
    suggested_url: Optional[str] = None
    suggested_title: Optional[str] = None
    suggested_song_id: Optional[int] = None # Deprecated
    suggested_song_ids: Optional[List[int]] = None
    suggested_concert_id: Optional[int] = None
    suggested_members: Optional[List[str]] = None
    suggested_duration: Optional[float] = None
    suggested_angle: Optional[str] = None
    suggested_coordinate_x: Optional[float] = None
    suggested_coordinate_y: Optional[float] = None
    suggested_sync_offset: Optional[float] = None
    suggested_setlist_id: Optional[int] = None
    suggested_start_time: Optional[float] = None
    suggested_event_name: Optional[str] = None

class ContributionBase(BaseModel):
    id: int
    video_id: Optional[int] = None
    video_title: Optional[str] = None
    suggested_url: Optional[str] = None
    suggested_title: Optional[str] = None
    suggested_song_id: Optional[int] = None # Deprecated
    suggested_song_ids: Optional[List[int]] = None
    suggested_concert_id: Optional[int] = None
    suggested_members: Optional[List[str]] = None
    suggested_duration: Optional[float] = None
    suggested_angle: Optional[str] = None
    suggested_coordinate_x: Optional[float] = None
    suggested_coordinate_y: Optional[float] = None
    suggested_sync_offset: Optional[float] = None
    suggested_setlist_id: Optional[int] = None
    suggested_start_time: Optional[float] = None
    suggested_event_name: Optional[str] = None
    is_processed: bool
    created_at: datetime

    class Config:
        from_attributes = True

class HomeSummary(BaseModel):
    songs: List[SongBase]
    concerts: List[ConcertBase]
    videos: List[VideoDetail]
    total_videos: int

    class Config:
        from_attributes = True
