import os
import tempfile
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


@pytest.fixture(autouse=True, scope="session")
def _temp_db_path() -> Iterator[None]:
    # The app lifespan calls init_db() against settings.database_path. Point that
    # at a throwaway temp file so tests never touch a real DB. Each test's queries
    # still go through the in-memory `session` override below.
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    os.environ["DATABASE_PATH"] = path
    import app.db as db
    from app.config import get_settings

    get_settings.cache_clear()
    db._engine = None  # ensure a fresh engine bound to the temp path
    yield
    db._engine = None  # drop the pool before deleting the file
    os.unlink(path)


@pytest.fixture(name="session")
def session_fixture() -> Iterator[Session]:
    # Import models so their tables are registered on SQLModel.metadata BEFORE
    # create_all — otherwise the in-memory DB has no tables. Centralized here so
    # individual test files don't each need this import.
    from app import models  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Iterator[TestClient]:
    from app.db import get_session
    from app.main import app

    def get_session_override() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_session, None)
