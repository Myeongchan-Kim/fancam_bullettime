from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...models.models import Song
from ...schemas.schemas import SongBase
from ...db import get_db

router = APIRouter(prefix="/api", tags=["songs"])

@router.get("/songs", response_model=List[SongBase])
def get_songs(db: Session = Depends(get_db)):
    return db.query(Song).order_by(Song.order).all()
