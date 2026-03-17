from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime

from app.models.models import Base, Video, Song, Concert, AngleSuggestion
from app.schemas.schemas import VideoDetail, SongBase, ConcertBase, AngleSuggestionBase, AngleSuggestionCreate, VideoUpdate
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./twice_fancam.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="TWICE World Tour Archive API")

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

@app.get("/api/videos", response_model=List[VideoDetail])
def get_videos(
    song_id: Optional[int] = None,
    concert_id: Optional[int] = None,
    member: Optional[str] = None,
    angle: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Video).options(joinedload(Video.song), joinedload(Video.concert))
    
    if song_id:
        query = query.filter(Video.song_id == song_id)
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
    video = db.query(Video).options(joinedload(Video.song), joinedload(Video.concert)).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@app.patch("/api/videos/{video_id}", response_model=VideoDetail)
def update_video(video_id: int, video_update: VideoUpdate, db: Session = Depends(get_db)):
    db_video = db.query(Video).filter(Video.id == video_id).first()
    if not db_video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = video_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_video, key, value)
    
    db.commit()
    db.refresh(db_video)
    # Refresh with joined load to return full detail
    return db.query(Video).options(joinedload(Video.song), joinedload(Video.concert)).filter(Video.id == video_id).first()

@app.get("/api/songs", response_model=List[SongBase])
def get_songs(db: Session = Depends(get_db)):
    return db.query(Song).all()

@app.get("/api/concerts", response_model=List[ConcertBase])
def get_concerts(db: Session = Depends(get_db)):
    return db.query(Concert).order_by(Concert.date.desc()).all()

@app.post("/api/videos/{video_id}/suggestions", response_model=AngleSuggestionBase)
def create_suggestion(
    video_id: int, 
    suggestion: AngleSuggestionCreate, 
    request: Request,
    db: Session = Depends(get_db)
):
    # 영상 존재 여부 확인
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    new_suggestion = AngleSuggestion(
        video_id=video_id,
        suggested_angle=suggestion.suggested_angle,
        suggested_sync_offset=suggestion.suggested_sync_offset,
        user_ip=request.client.host
    )
    db.add(new_suggestion)
    
    # [위키 로직] 동일 영상에 대한 제안이 쌓이면 자동으로 업데이트하는 로직 (나중에 고도화 가능)
    # 일단은 제안이 오면 바로 비디오 정보를 업데이트하는 방식으로 단순화
    video.angle = suggestion.suggested_angle
    video.sync_offset = suggestion.suggested_sync_offset
    
    db.commit()
    db.refresh(new_suggestion)
    return new_suggestion

@app.get("/api/videos/{video_id}/suggestions", response_model=List[AngleSuggestionBase])
def get_suggestions(video_id: int, db: Session = Depends(get_db)):
    return db.query(AngleSuggestion).filter(AngleSuggestion.video_id == video_id).all()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
