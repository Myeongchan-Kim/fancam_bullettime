from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload, joinedload

from ...models.models import Video, Concert, ConcertSetlist
from ...schemas.schemas import ConcertBase
from ...db import get_db
from .utils import verify_admin

router = APIRouter(prefix="/api", tags=["concerts"])

@router.get("/concerts", response_model=List[ConcertBase])
def get_concerts(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=86400"
    concert_counts = db.query(Video.concert_id, func.count(Video.id)).group_by(Video.concert_id).all()
    counts_dict = {c_id: count for c_id, count in concert_counts if c_id is not None}
    
    concerts = db.query(Concert).options(selectinload(Concert.setlist).joinedload(ConcertSetlist.song)).order_by(Concert.date.desc()).all()
    for c in concerts:
        c.video_count = counts_dict.get(c.id, 0)
    return concerts


@router.patch("/admin/setlist/{item_id}")
def update_setlist_item(item_id: int, start_time: float = Query(...), db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    item = db.query(ConcertSetlist).filter(ConcertSetlist.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Setlist item not found")
    item.start_time = start_time
    db.commit()
    return {"message": "Updated setlist timing", "new_time": start_time}

@router.post("/admin/concerts/{concert_id}/setlist")
def import_setlist(concert_id: int, items: List[dict], db: Session = Depends(get_db), admin: bool = Depends(verify_admin)):
    if not db.query(Concert).filter(Concert.id == concert_id).first(): raise HTTPException(status_code=404, detail="Concert not found")
    db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).delete()
    for idx, item in enumerate(items):
        db.add(ConcertSetlist(concert_id=concert_id, song_id=item.get("song_id"), event_name=item.get("event_name"), start_time=item.get("start_time"), display_order=idx))
    db.commit()
    return {"message": f"Successfully imported {len(items)} setlist items"}
