from sqlmodel import Session, select

from app.models import Category

# (name, color) — a sensible editable default set.
DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Groceries", "#22c55e"),
    ("Dining", "#f97316"),
    ("Transport", "#3b82f6"),
    ("Utilities", "#eab308"),
    ("Housing", "#8b5cf6"),
    ("Shopping", "#ec4899"),
    ("Health", "#14b8a6"),
    ("Entertainment", "#a855f7"),
    ("Subscriptions", "#6366f1"),
    ("Income", "#10b981"),
    ("Transfers", "#64748b"),
    ("Uncategorized", "#94a3b8"),
]


def seed_categories(session: Session) -> None:
    """Insert the default categories once (only when the table is empty)."""
    if session.exec(select(Category)).first() is not None:
        return
    for name, color in DEFAULT_CATEGORIES:
        session.add(Category(name=name, color=color))
    session.commit()
