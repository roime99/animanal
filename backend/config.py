from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root = parent of backend/ (same folder as app.py, animals.db).
# This distribution is embed-only: no `images/` folder is required or used.
_REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_path: Path = _REPO_ROOT / "animals.db"
    images_dir: Path = _REPO_ROOT / "images"
    embed_only: bool = Field(
        default=True,
        description="If True, never serve /api/images; Wikimedia URLs from DB only (Animal Trivia embed edition).",
    )


settings = Settings()
