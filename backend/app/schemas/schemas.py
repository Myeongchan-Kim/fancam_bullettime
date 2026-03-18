from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SongBase(BaseModel):
    id: int
    name: str
    order: Optional[int] = None
    is_solo: bool
    member_name: Optional[str] = None

    class Config:
        from_attributes = True

class ConcertBase(BaseModel):
    id: int
    date: datetime
    city: str
    country: str
    venue: str

    class Config:
        from_attributes = True

class VideoBase(BaseModel):
    id: int
    youtube_id: str
    title: str
    thumbnail_url: str
    url: str
    song_id: Optional[int]
    concert_id: Optional[int]
    members: List[str]
    angle: str
    coordinate_x: Optional[float] = None
    coordinate_y: Optional[float] = None
    sync_offset: float
    created_at: datetime

    class Config:
        from_attributes = True

class VideoDetail(VideoBase):
    song: Optional[SongBase]
    concert: Optional[ConcertBase]

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    song_id: Optional[int] = None
    concert_id: Optional[int] = None
    members: Optional[List[str]] = None
    angle: Optional[str] = None
    coordinate_x: Optional[float] = None
    coordinate_y: Optional[float] = None
    sync_offset: Optional[float] = None

class ContributionCreate(BaseModel):
    suggested_title: Optional[str] = None
    suggested_song_id: Optional[int] = None
    suggested_concert_id: Optional[int] = None
    suggested_members: Optional[List[str]] = None
    suggested_angle: Optional[str] = None
    suggested_coordinate_x: Optional[float] = None
    suggested_coordinate_y: Optional[float] = None
    suggested_sync_offset: Optional[float] = None

class ContributionBase(BaseModel):
    id: int
    video_id: int
    suggested_title: Optional[str]
    suggested_song_id: Optional[int]
    suggested_concert_id: Optional[int]
    suggested_members: Optional[List[str]]
    suggested_angle: Optional[str]
    suggested_coordinate_x: Optional[float]
    suggested_coordinate_y: Optional[float]
    suggested_sync_offset: Optional[float]
    is_processed: bool
    created_at: datetime

    class Config:
        from_attributes = True
