import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

backend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
if os.path.exists(backend_env):
    load_dotenv(backend_env)
load_dotenv()

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "") # Supabase PostgreSQL required
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ADMIN_SECRET_KEY: str = os.getenv("ADMIN_SECRET_KEY", "851212")
    ADMIN_KEY: str = os.getenv("ADMIN_KEY", "twice360-admin-secret-key")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000/api")

    model_config = SettingsConfigDict(case_sensitive=True, extra="ignore")

settings = Settings()
