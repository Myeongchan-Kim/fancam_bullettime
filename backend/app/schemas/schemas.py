from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SongBase(BaseModel):
    id: int
    name: str
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
    sync_offset: Optional[float] = None

class AngleSuggestionCreate(BaseModel):
    suggested_angle: str
    suggested_sync_offset: float

class AngleSuggestionBase(BaseModel):
    id: int
    video_id: int
    suggested_angle: str
    suggested_sync_offset: float
    created_at: datetime

    class Config:
        from_attributes = True
