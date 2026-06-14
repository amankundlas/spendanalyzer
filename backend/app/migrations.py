from sqlalchemy import text
from sqlalchemy.engine import Engine


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f'PRAGMA table_info("{table}")')).all()
    return {row[1] for row in rows}


def run_migrations(engine: Engine) -> None:
    """Apply idempotent schema migrations to an existing SQLite DB.

    create_all() creates missing tables but never ALTERs existing ones, so a
    deployed `transaction` table won't gain new columns automatically. Each step
    here is guarded by a column-existence check, so it is safe on every startup
    and on a fresh DB alike.
    """
    with engine.begin() as conn:
        cols = _columns(conn, "transaction")
        if "category_id" not in cols:
            conn.execute(
                text(
                    'ALTER TABLE "transaction" '
                    "ADD COLUMN category_id INTEGER REFERENCES category(id)"
                )
            )
