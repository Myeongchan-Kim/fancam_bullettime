from fastapi import FastAPI, Depends, HTTPException, Query, Request, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
import os
from dotenv import load_dotenv

from app.models.models import Base, Video, Song, Concert, Contribution
from app.schemas.schemas import VideoDetail, SongBase, ConcertBase, ContributionBase, ContributionCreate, VideoUpdate
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.crawler.recheck_worker import run_recheck_job, recheck_status

load_dotenv()

DATABASE_URL = "sqlite:///./twice_fancam.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="TWICE World Tour 360° Fancam Archive API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 개발 중에는 모두 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB 의존성
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Admin Auth 의존성
def verify_admin(x_admin_key: Optional[str] = Header(None)):
    if x_admin_key != os.getenv("ADMIN_SECRET_KEY"):
        raise HTTPException(status_code=403, detail="Admin access denied")
    return True

def apply_contribution_to_video(db: Session, video: Video, contrib: Contribution):
    """Apply contribution values to a video and mark as processed."""
    if contrib.suggested_title is not None: video.title = contrib.suggested_title
    
    # Sync song updates across both deprecated and new fields
    if getattr(contrib, 'suggested_song_ids', None) is not None:
        requested_ids = contrib.suggested_song_ids
        found_songs = db.query(Song).filter(Song.id.in_(requested_ids)).all()
        # Only apply if all requested songs exist to prevent partial data corruption
        if len(found_songs) == len(requested_ids):
            video.songs = found_songs
            if found_songs:
                video.song_id = found_songs[0].id
            else:
                video.song_id = None
    elif contrib.suggested_song_id is not None:
        video.song_id = contrib.suggested_song_id
        song = db.query(Song).filter(Song.id == contrib.suggested_song_id).first()
        video.songs = [song] if song else []

    if contrib.suggested_concert_id is not None: video.concert_id = contrib.suggested_concert_id
    if contrib.suggested_members is not None: video.members = contrib.suggested_members
    if contrib.suggested_angle is not None: video.angle = contrib.suggested_angle
    if contrib.suggested_coordinate_x is not None: video.coordinate_x = contrib.suggested_coordinate_x
    if contrib.suggested_coordinate_y is not None: video.coordinate_y = contrib.suggested_coordinate_y
    if contrib.suggested_sync_offset is not None: video.sync_offset = contrib.suggested_sync_offset
    
    contrib.is_processed = True
    # COMMIT REMOVED - Caller must handle transaction atomicity

@app.get("/api/videos", response_model=List[VideoDetail])
def get_videos(
    song_id: Optional[int] = None,
    start_order: Optional[int] = None,
    end_order: Optional[int] = None,
    concert_id: Optional[int] = None,
    member: Optional[str] = None,
    angle: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert))
    
    if song_id:
        query = query.filter(Video.song_id == song_id)
    
    if start_order is not None and end_order is not None:
        query = query.join(Video.songs).filter(Song.order >= start_order, Song.order <= end_order).distinct()
    
    if concert_id:
        query = query.filter(Video.concert_id == concert_id)
    if member:
        # SQLite JSON text search (e.g. member is "Sana", search for "Sana" in the string representation of JSON)
        from sqlalchemy import String
        query = query.filter(Video.members.cast(String).like(f"%{member}%"))
    if angle:
        query = query.filter(Video.angle == angle)
        
    return query.order_by(Video.created_at.desc()).all()

@app.get("/api/videos/{video_id}", response_model=VideoDetail)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@app.patch("/api/videos/{video_id}", response_model=VideoDetail)
def update_video(video_id: int, video_update: VideoUpdate, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video_update.model_dump(exclude_unset=True)
    
    if "song_ids" in update_data:
        song_ids = update_data.pop("song_ids")
        if song_ids is not None:
            db_video.songs = db.query(Song).filter(Song.id.in_(song_ids)).all()
        else:
            db_video.songs = []

    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    # Refresh with joined load to return full detail
    return db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video_id).first()

@app.get("/api/songs", response_model=List[SongBase])
def get_songs(db: Session = Depends(get_db)):
    return db.query(Song).order_by(Song.order).all()

@app.get("/api/concerts", response_model=List[ConcertBase])
def get_concerts(db: Session = Depends(get_db)):
    return db.query(Concert).order_by(Concert.date.desc()).all()

import re

def get_video_id(url: str):
    # Robust regex for various YouTube URL structures and trailing parameters
    pattern = r'(?:v=|\/|embed\/|shorts\/|live\/|youtu\.be\/|^)([0-9A-Za-z_-]{11})(?:\?|&|$|\/)'
    match = re.search(pattern, url)
    return match.group(1) if match else None

@app.post("/api/contributions", response_model=ContributionBase)
def create_general_contribution(
    contribution: ContributionCreate, 
    request: Request,
    db: Session = Depends(get_db)
):
    if not contribution.suggested_url:
        raise HTTPException(status_code=400, detail="suggested_url is required for new videos")
        
    yt_id = get_video_id(contribution.suggested_url)
    if not yt_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    existing_video = db.query(Video).filter(Video.youtube_id == yt_id).first()
    if existing_video:
        raise HTTPException(status_code=400, detail="Video already exists in the archive")
        
    new_contrib = Contribution(
        suggested_url=contribution.suggested_url,
        suggested_title=contribution.suggested_title,
        suggested_song_ids=contribution.suggested_song_ids,
        suggested_concert_id=contribution.suggested_concert_id,
        suggested_members=contribution.suggested_members or [],
        suggested_angle=contribution.suggested_angle or "Unknown",
        user_ip=request.client.host
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)
    return new_contrib

@app.post("/api/videos/{video_id}/contributions", response_model=ContributionBase)
def create_contribution(
    video_id: int, 
    contribution: ContributionCreate, 
    request: Request,
    db: Session = Depends(get_db)
):
    # 영상 존재 여부 확인
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    new_contrib = Contribution(
        video_id=video_id,
        suggested_title=contribution.suggested_title,
        suggested_song_id=contribution.suggested_song_id, # Deprecated
        suggested_song_ids=contribution.suggested_song_ids,
        suggested_concert_id=contribution.suggested_concert_id,
        suggested_members=contribution.suggested_members,
        suggested_angle=contribution.suggested_angle,
        suggested_coordinate_x=contribution.suggested_coordinate_x,
        suggested_coordinate_y=contribution.suggested_coordinate_y,
        suggested_sync_offset=contribution.suggested_sync_offset,
        user_ip=request.client.host
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)

    # AUTO-APPROVE LOGIC:
    # If the video currently has no songs assigned, and this contribution provides songs,
    # auto-approve the first contribution to speed up initial labeling.
    if len(video.songs) == 0 and contribution.suggested_song_ids:
        apply_contribution_to_video(db, video, new_contrib)
        db.commit()
        
    return new_contrib

@app.get("/api/videos/{video_id}/contributions", response_model=List[ContributionBase])
def get_contributions(video_id: int, db: Session = Depends(get_db)):
    return db.query(Contribution).filter(Contribution.video_id == video_id).order_by(Contribution.created_at.desc()).all()

@app.get("/api/admin/contributions/pending", response_model=List[ContributionBase])
def get_pending_contributions(db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    return db.query(Contribution).filter(Contribution.is_processed == False).order_by(Contribution.created_at.desc()).all()

@app.post("/api/contributions/{contribution_id}/approve", response_model=VideoDetail)
def approve_contribution(
    contribution_id: int, 
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    contrib = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not contrib:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    if contrib.video_id is None:
        if not contrib.suggested_url:
            raise HTTPException(status_code=400, detail="suggested_url is required for new videos")
        yt_id = get_video_id(contrib.suggested_url)
        if not yt_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
            
        existing = db.query(Video).filter(Video.youtube_id == yt_id).first()
        if existing:
            video = existing
        else:
            video = Video(
                youtube_id=yt_id,
                url=contrib.suggested_url,
                title=contrib.suggested_title or "Unknown Title",
                thumbnail_url=f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg",
                members=contrib.suggested_members or [],
                angle=contrib.suggested_angle or "Unknown",
                concert_id=contrib.suggested_concert_id
            )
            db.add(video)
            db.flush() # Ensure ID is generated within the transaction
        
        contrib.video_id = video.id
        apply_contribution_to_video(db, video, contrib)
    else:
        video = db.query(Video).filter(Video.id == contrib.video_id).first()
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        apply_contribution_to_video(db, video, contrib)
    
    db.commit() # Atomic commit for both potential new video and the contribution update
    
    return db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video.id).first()

@app.delete("/api/contributions/{contribution_id}", status_code=204)
def delete_contribution(
    contribution_id: int, 
    db: Session = Depends(get_db),
    admin: bool = Depends(verify_admin)
):
    contrib = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not contrib:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    db.delete(contrib)
    db.commit()
    return None

@app.post("/api/admin/recheck/start")
def start_recheck(background_tasks: BackgroundTasks, admin: bool = Depends(verify_admin)):
    if recheck_status["status"] == "Running":
        raise HTTPException(status_code=400, detail="Recheck job is already running")
    background_tasks.add_task(run_recheck_job)
    return {"message": "Recheck job started"}

@app.get("/api/admin/recheck/status")
def get_recheck_status(admin: bool = Depends(verify_admin)):
    return recheck_status

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
