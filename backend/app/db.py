import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
from .core.config import settings

DATABASE_URL = os.getenv("DATABASE_URL") or settings.DATABASE_URL

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set.")

# Detect if running on Vercel
IS_VERCEL = os.getenv("VERCEL") == "1"

engine_kwargs = {
    "connect_args": {"sslmode": "require", "connect_timeout": 10} if "supabase" in DATABASE_URL or "supabase.co" in DATABASE_URL else {}
}

if IS_VERCEL:
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs["poolclass"] = QueuePool
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 0

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Simple database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
