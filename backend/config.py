from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root = parent of backend/ (same folder as app.py, animals.db, images/)
_REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_path: Path = _REPO_ROOT / "animals.db"
    images_dir: Path = _REPO_ROOT / "images"
    social_db_path: Path = _REPO_ROOT / "backend" / "data" / "social.sqlite"


settings = Settings()
