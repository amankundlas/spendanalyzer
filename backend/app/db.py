from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

# Engine is created lazily (not at import time) so tests can set DATABASE_PATH
# before the first connection. check_same_thread=False is safe: FastAPI uses a
# per-request Session.
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            f"sqlite:///{get_settings().database_path}",
            connect_args={"check_same_thread": False},
        )
    return _engine


def init_db() -> None:
    from app import models  # noqa: F401
    from app.migrations import run_migrations
    from app.seed import seed_categories

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    run_migrations(engine)
    with Session(engine) as session:
        seed_categories(session)


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
