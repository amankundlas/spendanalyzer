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

        # Retire the old seeded "Uncategorized" category: NULL category_id IS the
        # uncategorized bucket, so a literal category by that name is redundant and
        # produces a confusing second "Uncategorized" row. Reassign anything on it
        # to NULL and remove it. Idempotent — a no-op once it's gone.
        has_category = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name = 'category'")
        ).first()
        row = (
            conn.execute(text("SELECT id FROM category WHERE name = 'Uncategorized'")).first()
            if has_category
            else None
        )
        if row is not None:
            cat_id = row[0]
            conn.execute(
                text('UPDATE "transaction" SET category_id = NULL WHERE category_id = :id'),
                {"id": cat_id},
            )
            for tbl in ("categoryrule", "budget"):
                if conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name = :t"),
                    {"t": tbl},
                ).first():
                    conn.execute(text(f"DELETE FROM {tbl} WHERE category_id = :id"), {"id": cat_id})
            conn.execute(text("DELETE FROM category WHERE id = :id"), {"id": cat_id})
