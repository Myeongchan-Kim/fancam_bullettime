import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import engine, SessionLocal, get_db
from .api.v1.videos import router as videos_router
from .api.v1.concerts import router as concerts_router
from .api.v1.songs import router as songs_router
from .api.v1.contributions import router as contributions_router
from .api.v1.admin import router as admin_router

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- FastAPI App ---
app = FastAPI(title="TWICE World Tour 360° Fancam Archive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register Routers ---
app.include_router(videos_router)
app.include_router(concerts_router)
app.include_router(songs_router)
app.include_router(contributions_router)
app.include_router(admin_router)

@app.get("/")
def read_root():
    return {"message": "TWICE World Tour 360° Fancam Archive API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
