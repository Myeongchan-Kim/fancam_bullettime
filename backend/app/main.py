import os
import json
import logging
import re
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker, Session, joinedload, selectinload
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

from .models.models import Base, Video, Song, Concert, ConcertSetlist, Contribution
from .schemas.schemas import VideoDetail, VideoUpdate, SongBase, ConcertBase, ContributionBase, ContributionCreate, HomeSummary
from .core.config import settings
from .crawler.recheck_worker import run_recheck_job, recheck_status

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# --- Database Setup ---
DATABASE_URL = os.getenv("DATABASE_URL") or settings.DATABASE_URL

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set.")

# Use NullPool for Serverless environments (Vercel) to ensure fresh connections
from sqlalchemy.pool import NullPool

engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    connect_args={"sslmode": "require", "connect_timeout": 10} if "supabase" in DATABASE_URL or "supabase.co" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Database session dependency with one-time retry logic for transient SSL/Pooler errors."""
    db = SessionLocal()
    try:
        # Simple health check to ensure connection is valid
        db.execute(func.now())
        yield db
    except Exception as e:
        error_msg = str(e)
        logger.warning(f"⚠️ First DB connection attempt failed: {error_msg}. Retrying...")
        db.close()
        # Retry once
        db = SessionLocal()
        try:
            db.execute(func.now())
            yield db
        except Exception as retry_e:
            retry_error_msg = str(retry_e)
            logger.error(f"❌ DB connection failed after retry: {retry_error_msg}")
            # Log the type of error to help narrow it down
            if "EMAXCONNSESSION" in retry_error_msg:
                detail = "Database has too many active connections (limit reached). Please wait a moment."
            elif "SSL connection has been closed" in retry_error_msg:
                detail = "Database connection was dropped by the provider. Please try again."
            else:
                detail = f"Database connection error: {retry_error_msg[:100]}"
            raise HTTPException(status_code=500, detail=detail)
    finally:
        db.close()

# --- Utility Functions ---
def ensure_list(data):
    """문자열이 리스트가 될 때까지 반복적으로 파싱하는 안전장치 (Iterative)"""
    if data is None:
        return []
    current = data
    for _ in range(5):
        if isinstance(current, list):
            return current
        if not isinstance(current, str):
            break
        try:
            current = json.loads(current)
        except (json.JSONDecodeError, TypeError):
            break
            
    if not isinstance(current, list):
        return []

# --- FastAPI App ---
app = FastAPI(title="TWICE World Tour 360° Fancam Archive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_admin(x_admin_key: Optional[str] = Header(None)):
    if not settings.ADMIN_SECRET_KEY:
        return False
    if x_admin_key != settings.ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return True

def _maybe_auto_approve(db: Session, contribution_id: int):
    if settings.AUTO_APPROVE:
        try:
            internal_approve_contribution(db, contribution_id)
            db.commit()
        except Exception as e:
            logger.error(f"Auto-approve failed for contribution {contribution_id}: {str(e)}")

def apply_contribution_to_video(db: Session, video: Optional[Video], contrib: Contribution):
    if video:
        if contrib.suggested_title is not None: video.title = contrib.suggested_title
        suggested_song_ids = getattr(contrib, 'suggested_song_ids', None)
        if suggested_song_ids is not None and isinstance(suggested_song_ids, list):
            requested_ids = suggested_song_ids
            found_songs = db.query(Song).filter(Song.id.in_(requested_ids)).all() if requested_ids else []
            if len(found_songs) == len(requested_ids):
                video.songs = found_songs
                video.song_id = found_songs[0].id if found_songs else None
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
        if contrib.suggested_duration is not None: video.duration = contrib.suggested_duration
        if contrib.suggested_is_shorts is not None: video.is_shorts = contrib.suggested_is_shorts
    
    concert_id = contrib.suggested_concert_id or (video.concert_id if video else None)
    if concert_id:
        if contrib.suggested_setlist_id is not None:
            setlist_item = db.query(ConcertSetlist).filter(ConcertSetlist.id == contrib.suggested_setlist_id).first()
            if setlist_item:
                if contrib.suggested_start_time is not None: setlist_item.start_time = contrib.suggested_start_time
                if contrib.suggested_event_name: setlist_item.event_name = contrib.suggested_event_name
        elif contrib.suggested_event_name:
            max_order_result = db.query(func.max(ConcertSetlist.display_order)).filter(ConcertSetlist.concert_id == concert_id).scalar()
            max_order = max_order_result if max_order_result is not None else 0
            new_item = ConcertSetlist(
                concert_id=concert_id,
                event_name=contrib.suggested_event_name,
                start_time=contrib.suggested_start_time,
                display_order=max_order + 1
            )
            db.add(new_item)
    contrib.is_processed = True

# --- API Endpoints ---

@app.get("/api/videos", response_model=List[VideoDetail])
def get_videos(
    song_id: Optional[int] = None,
    concert_id: Optional[int] = None,
    member: Optional[str] = None,
    angle: Optional[str] = None,
    shorts_only: bool = Query(False),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    query = db.query(Video).options(
        joinedload(Video.songs),
        joinedload(Video.concert).selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
    )

    if shorts_only: query = query.filter(Video.is_shorts == True)
    if concert_id: query = query.filter(Video.concert_id == concert_id)
    if song_id: query = query.filter(Video.songs.any(Song.id == song_id))
    if member:
        from sqlalchemy import String
        query = query.filter(Video.members.cast(String).like(f"%{member}%"))
    if angle: query = query.filter(Video.angle == angle)
        
    results = query.distinct().order_by(Video.duration.asc(), Video.created_at.desc()).limit(limit).all()
    
    for v in results:
        v.members = ensure_list(v.members)
    return results

@app.get("/api/videos/{video_id}", response_model=VideoDetail)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video_id).first()
    if not video: raise HTTPException(status_code=404, detail="Video not found")
    video.members = ensure_list(video.members)
    return video

@app.patch("/api/videos/{video_id}", response_model=VideoDetail)
def update_video(video_id: int, video_update: VideoUpdate, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if not db_video: raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video_update.model_dump(exclude_unset=True)
    if "song_ids" in update_data:
        song_ids = update_data.pop("song_ids")
        db_video.songs = db.query(Song).filter(Song.id.in_(song_ids)).all() if song_ids is not None else []

    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    return db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video_id).first()

@app.get("/api/songs", response_model=List[SongBase])
def get_songs(db: Session = Depends(get_db)):
    return db.query(Song).order_by(Song.order).all()

@app.get("/api/concerts", response_model=List[ConcertBase])
def get_concerts(db: Session = Depends(get_db)):
    return db.query(Concert).options(selectinload(Concert.setlist).joinedload(ConcertSetlist.song)).order_by(Concert.date.desc()).all()

@app.get("/api/home/summary", response_model=HomeSummary)
def get_home_summary(db: Session = Depends(get_db)):
    """Optimized endpoint for initial page load without memory caching."""
    try:
        # 1. Fetch metadata (small datasets)
        songs = db.query(Song).order_by(Song.order).all()
        concerts = db.query(Concert).options(
            selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
        ).order_by(Concert.date.desc()).all()

        # 2. Get latest videos (indexed query)
        videos = db.query(Video).options(
            joinedload(Video.songs),
            joinedload(Video.concert).selectinload(Concert.setlist).joinedload(ConcertSetlist.song)
        ).distinct().order_by(Video.created_at.desc()).all()

        for v in videos:
            v.members = ensure_list(v.members)

        return {
            "songs": songs,
            "concerts": concerts,
            "videos": videos,
            "total_videos": db.query(Video).count()
        }
    except Exception as e:
        logger.error(f"❌ Error in get_home_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def get_video_id(url: str):
    pattern = r'(?:v=|be\/|v\/|embed\/|shorts\/|live\/|^)([0-9A-Za-z_-]{11})(?:\?|&|$|\/)'
    match = re.search(pattern, url)
    return match.group(1) if match else None

@app.post("/api/contributions", response_model=ContributionBase)
def create_general_contribution(contribution: ContributionCreate, request: Request, db: Session = Depends(get_db)):
    if not contribution.suggested_url: raise HTTPException(status_code=400, detail="suggested_url is required")
    yt_id = get_video_id(contribution.suggested_url)
    if not yt_id: raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    if db.query(Video).filter(Video.youtube_id == yt_id).first(): raise HTTPException(status_code=400, detail="Video already exists")
        
    new_contrib = Contribution(
        suggested_url=contribution.suggested_url,
        suggested_title=contribution.suggested_title,
        suggested_song_ids=contribution.suggested_song_ids,
        suggested_concert_id=contribution.suggested_concert_id,
        suggested_members=contribution.suggested_members or [],
        suggested_duration=contribution.suggested_duration,
        suggested_is_shorts=contribution.suggested_is_shorts or False,
        suggested_angle=contribution.suggested_angle or "Unknown",
        suggested_setlist_id=contribution.suggested_setlist_id,
        suggested_start_time=contribution.suggested_start_time,
        suggested_event_name=contribution.suggested_event_name,
        user_ip=request.client.host
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)
    _maybe_auto_approve(db, new_contrib.id)
    return new_contrib

@app.post("/api/videos/{video_id}/contributions", response_model=ContributionBase)
def create_contribution(video_id: int, contribution: ContributionCreate, request: Request, db: Session = Depends(get_db)):
    if not db.query(Video).filter(Video.id == video_id).first(): raise HTTPException(status_code=404, detail="Video not found")
    new_contrib = Contribution(
        video_id=video_id,
        suggested_title=contribution.suggested_title,
        suggested_song_ids=contribution.suggested_song_ids,
        suggested_concert_id=contribution.suggested_concert_id,
        suggested_members=contribution.suggested_members,
        suggested_duration=contribution.suggested_duration,
        suggested_is_shorts=contribution.suggested_is_shorts or False,
        suggested_angle=contribution.suggested_angle,
        suggested_coordinate_x=contribution.suggested_coordinate_x,
        suggested_coordinate_y=contribution.suggested_coordinate_y,
        suggested_sync_offset=contribution.suggested_sync_offset,
        suggested_setlist_id=contribution.suggested_setlist_id,
        suggested_start_time=contribution.suggested_start_time,
        suggested_event_name=contribution.suggested_event_name,
        user_ip=request.client.host
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)
    _maybe_auto_approve(db, new_contrib.id)
    return new_contrib

@app.get("/api/videos/{video_id}/contributions", response_model=List[ContributionBase])
def get_contributions(video_id: int, db: Session = Depends(get_db)):
    results = db.query(Contribution).filter(Contribution.video_id == video_id).order_by(Contribution.created_at.desc()).all()
    output = []
    for r in results:
        output.append({
            "id": r.id, "video_id": r.video_id, "video_title": r.video.title if r.video else None,
            "suggested_url": r.suggested_url, "suggested_title": r.suggested_title,
            "suggested_song_ids": ensure_list(r.suggested_song_ids), "suggested_concert_id": r.suggested_concert_id,
            "suggested_members": ensure_list(r.suggested_members), "suggested_duration": r.suggested_duration,
            "suggested_angle": r.suggested_angle, "suggested_coordinate_x": r.suggested_coordinate_x,
            "suggested_coordinate_y": r.suggested_coordinate_y, "suggested_sync_offset": r.suggested_sync_offset,
            "suggested_setlist_id": r.suggested_setlist_id, "suggested_start_time": r.suggested_start_time,
            "suggested_event_name": r.suggested_event_name, "is_processed": r.is_processed, "created_at": r.created_at
        })
    return output

@app.get("/api/admin/contributions/pending", response_model=List[ContributionBase])
def get_pending_contributions(db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    results = db.query(Contribution).options(joinedload(Contribution.video)).filter(Contribution.is_processed == False).order_by(Contribution.created_at.desc()).all()
    output = []
    for r in results:
        output.append({
            "id": r.id, "video_id": r.video_id, "video_title": r.video.title if r.video else None,
            "suggested_url": r.suggested_url, "suggested_title": r.suggested_title,
            "suggested_song_ids": ensure_list(r.suggested_song_ids), "suggested_concert_id": r.suggested_concert_id,
            "suggested_members": ensure_list(r.suggested_members), "suggested_duration": r.suggested_duration,
            "suggested_angle": r.suggested_angle, "suggested_coordinate_x": r.suggested_coordinate_x,
            "suggested_coordinate_y": r.suggested_coordinate_y, "suggested_sync_offset": r.suggested_sync_offset,
            "suggested_setlist_id": r.suggested_setlist_id, "suggested_start_time": r.suggested_start_time,
            "suggested_event_name": r.suggested_event_name, "is_processed": r.is_processed, "created_at": r.created_at
        })
    return output

@app.patch("/api/admin/setlist/{item_id}")
def update_setlist_item(item_id: int, start_time: float = Query(...), db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    item = db.query(ConcertSetlist).filter(ConcertSetlist.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Setlist item not found")
    item.start_time = start_time
    db.commit()
    return {"message": "Updated setlist timing", "new_time": start_time}

@app.post("/api/admin/concerts/{concert_id}/setlist")
def import_setlist(concert_id: int, items: List[dict], db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    if not db.query(Concert).filter(Concert.id == concert_id).first(): raise HTTPException(status_code=404, detail="Concert not found")
    db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).delete()
    for idx, item in enumerate(items):
        db.add(ConcertSetlist(concert_id=concert_id, song_id=item.get("song_id"), event_name=item.get("event_name"), start_time=item.get("start_time"), display_order=idx))
    db.commit()
    return {"message": f"Successfully imported {len(items)} setlist items"}

def internal_approve_contribution(db: Session, contribution_id: int):
    contrib = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not contrib: raise Exception("Contribution not found")
    if contrib.video_id is not None or contrib.suggested_url:
        if contrib.video_id is None:
            yt_id = get_video_id(contrib.suggested_url)
            if not yt_id: raise Exception("Invalid YouTube URL")
            existing = db.query(Video).filter(Video.youtube_id == yt_id).first()
            if existing: video = existing
            else:
                video = Video(youtube_id=yt_id, url=contrib.suggested_url, title=contrib.suggested_title or "Unknown Title", thumbnail_url=f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg", members=ensure_list(contrib.suggested_members), angle=contrib.suggested_angle or "Unknown", duration=contrib.suggested_duration if contrib.suggested_duration is not None else 9999.0, is_shorts=contrib.suggested_is_shorts or False, concert_id=contrib.suggested_concert_id)
                db.add(video)
                db.flush()
            contrib.video_id = video.id
            apply_contribution_to_video(db, video, contrib)
        else:
            video = db.query(Video).filter(Video.id == contrib.video_id).first()
            if not video: raise Exception("Video not found")
            apply_contribution_to_video(db, video, contrib)
        return video
    else:
        apply_contribution_to_video(db, None, contrib)
        return None

@app.post("/api/contributions/{contribution_id}/approve")
def approve_contribution(contribution_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    try:
        video = internal_approve_contribution(db, contribution_id)
        db.commit() 
        if video: return db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video.id).first()
        return {"message": "Contribution approved"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/admin/contributions/approve-all")
def approve_all_contributions(db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    pending = db.query(Contribution).filter(Contribution.is_processed == False).all()
    count, errors = 0, []
    for contrib in pending:
        try:
            internal_approve_contribution(db, contrib.id)
            count += 1
        except Exception as e:
            errors.append(f"ID {contrib.id}: {str(e)}")
    db.commit()
    return {"message": f"Successfully approved {count} contributions", "errors": errors}

@app.delete("/api/contributions/{contribution_id}", status_code=204)
def delete_contribution(contribution_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    contrib = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not contrib: raise HTTPException(status_code=404, detail="Contribution not found")
    db.delete(contrib)
    db.commit()
    return None

@app.post("/api/admin/recheck/start")
def start_recheck(background_tasks: BackgroundTasks, admin: bool = Depends(verify_admin)):
    if recheck_status["status"] == "Running": raise HTTPException(status_code=400, detail="Recheck job is already running")
    background_tasks.add_task(run_recheck_job)
    return {"message": "Recheck job started"}

@app.get("/api/admin/recheck/status")
def get_recheck_status(admin: bool = Depends(verify_admin)):
    return recheck_status

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
