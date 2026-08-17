from typing import List
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ...models.models import Song
from ...schemas.schemas import SongBase
from ...db import get_db

router = APIRouter(prefix="/api", tags=["songs"])

@router.get("/songs", response_model=List[SongBase])
def get_songs(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=86400"
    return db.query(Song).order_by(Song.order).all()

