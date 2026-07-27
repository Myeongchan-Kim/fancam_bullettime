from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from ...models.models import Video, Contribution
from ...schemas.schemas import ContributionBase, ContributionCreate, VideoDetail
from ...db import get_db
from .utils import (
    ensure_list,
    verify_admin,
    get_video_id,
    _maybe_auto_approve,
    internal_approve_contribution,
)

router = APIRouter(prefix="/api", tags=["contributions"])

@router.post("/contributions", response_model=ContributionBase)
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
        user_ip=request.client.host if request.client else None
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)
    _maybe_auto_approve(db, new_contrib.id)
    return new_contrib

@router.post("/videos/{video_id}/contributions", response_model=ContributionBase)
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
        user_ip=request.client.host if request.client else None
    )
    db.add(new_contrib)
    db.commit()
    db.refresh(new_contrib)
    _maybe_auto_approve(db, new_contrib.id)
    return new_contrib

@router.get("/videos/{video_id}/contributions", response_model=List[ContributionBase])
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

@router.get("/admin/contributions/pending", response_model=List[ContributionBase])
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

@router.post("/contributions/{contribution_id}/approve")
def approve_contribution(contribution_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    try:
        video = internal_approve_contribution(db, contribution_id)
        db.commit() 
        if video: return db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(Video.id == video.id).first()
        return {"message": "Contribution approved"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/admin/contributions/approve-all")
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

@router.delete("/contributions/{contribution_id}", status_code=204)
def delete_contribution(contribution_id: int, db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    contrib = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not contrib: raise HTTPException(status_code=404, detail="Contribution not found")
    db.delete(contrib)
    db.commit()
    return None
