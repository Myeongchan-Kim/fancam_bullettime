import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./twice_fancam.db")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ADMIN_KEY: str = os.getenv("ADMIN_KEY", "twice360-admin-secret-key")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000/api")

    class Config:
        case_sensitive = True

settings = Settings()

# Normalize postgres:// to postgresql:// (required for SQLAlchemy 1.4+)
if settings.DATABASE_URL.startswith("postgres://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)

