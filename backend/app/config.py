from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Spend Analyzer"
    database_path: str = "/data/spendanalyzer.sqlite3"
    ollama_url: str = "http://llm:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    session_secret: str = ""
    auth_password_hash: str = ""
    watch_dir: str = "/import"
    watch_interval: int = 30


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings.

    Wrapped in lru_cache so settings are read once and can be used as a
    FastAPI dependency; tests can override via get_settings.cache_clear().
    """
    return Settings()
