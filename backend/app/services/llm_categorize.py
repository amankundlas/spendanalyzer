from sqlmodel import Session, select

from app.models import Category, Transaction


def ai_categorize_uncategorized(session: Session, categorizer) -> int:
    """Run the LLM over uncategorized transactions; assign known categories.

    `categorizer` is any object with
    `categorize_one(merchant, description, names) -> str | None`.
    Returns the number of transactions updated.
    """
    categories = list(session.exec(select(Category)))
    names = [c.name for c in categories]
    name_to_id = {c.name: c.id for c in categories}
    if not names:
        return 0

    txns = list(session.exec(select(Transaction).where(Transaction.category_id.is_(None))))
    updated = 0
    for txn in txns:
        chosen = categorizer.categorize_one(txn.merchant, txn.description, names)
        if chosen in name_to_id:
            txn.category_id = name_to_id[chosen]
            updated += 1
    session.commit()
    return updated
