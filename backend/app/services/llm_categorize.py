from sqlmodel import Session, select

from app.models import Category, Transaction

# Transactions per LLM call. Batching turns ~90 sequential calls into a handful;
# output is tiny (one label each), so a roomy batch fits the context easily.
_BATCH_SIZE = 40


def ai_categorize_uncategorized(session: Session, categorizer) -> int:
    """Run the LLM over uncategorized transactions in batches; assign known categories.

    `categorizer` is any object with
    `categorize_batch(items, names) -> list[str | None]` (one entry per item).
    Each batch is committed as it completes, so partial progress survives an
    interruption. Returns the number of transactions updated.
    """
    categories = list(session.exec(select(Category)))
    names = [c.name for c in categories]
    name_to_id = {c.name: c.id for c in categories}
    if not names:
        return 0

    txns = list(session.exec(select(Transaction).where(Transaction.category_id.is_(None))))
    updated = 0
    for start in range(0, len(txns), _BATCH_SIZE):
        batch = txns[start : start + _BATCH_SIZE]
        items = [(t.merchant, t.description) for t in batch]
        chosen = categorizer.categorize_batch(items, names)
        for txn, name in zip(batch, chosen):
            if name in name_to_id:
                txn.category_id = name_to_id[name]
                updated += 1
        session.commit()  # incremental: each batch is saved as it finishes
    return updated
