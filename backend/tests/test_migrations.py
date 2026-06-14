from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.migrations import run_migrations


def _column_names(engine, table: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f'PRAGMA table_info("{table}")')).all()
    return {r[1] for r in rows}


def test_migration_adds_category_id_to_legacy_transaction_table():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE \"transaction\" ("
                "id INTEGER PRIMARY KEY, account_id INTEGER, date DATE, "
                "description TEXT, merchant TEXT, amount_cents INTEGER, "
                "direction TEXT, source TEXT, import_batch_id INTEGER, dedupe_hash TEXT)"
            )
        )
    assert "category_id" not in _column_names(engine, "transaction")

    run_migrations(engine)
    assert "category_id" in _column_names(engine, "transaction")

    run_migrations(engine)  # idempotent
    assert "category_id" in _column_names(engine, "transaction")


def test_migration_noop_on_fresh_schema():
    from app import models  # noqa: F401

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    run_migrations(engine)
    assert "category_id" in _column_names(engine, "transaction")
