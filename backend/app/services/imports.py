from sqlmodel import Session, select

from app.dedupe import dedupe_hash, normalize_description
from app.models import ImportBatch, Transaction
from app.schemas import ColumnMapping, ImportPreview, ImportResult
from app.services.csv_import import parse_rows


def _existing_hashes(session: Session, account_id: int) -> set[str]:
    rows = session.exec(
        select(Transaction.dedupe_hash).where(Transaction.account_id == account_id)
    ).all()
    return set(rows)


def preview_import(
    session: Session, account_id: int, text: str, mapping: ColumnMapping
) -> ImportPreview:
    parsed = parse_rows(text, mapping)
    existing = _existing_hashes(session, account_id)
    seen: set[str] = set()
    added = 0
    duplicate = 0
    for row in parsed:
        h = dedupe_hash(
            account_id, row.date, row.amount_cents, normalize_description(row.description)
        )
        if h in existing or h in seen:
            duplicate += 1
        else:
            seen.add(h)
            added += 1
    return ImportPreview(rows=parsed, added_count=added, duplicate_count=duplicate)


def commit_import(
    session: Session, account_id: int, filename: str, text: str, mapping: ColumnMapping
) -> ImportResult:
    from app.models import CategoryRule
    from app.services.categorize import match_category

    parsed = parse_rows(text, mapping)
    rules = list(session.exec(select(CategoryRule)))
    existing = _existing_hashes(session, account_id)

    batch = ImportBatch(account_id=account_id, source="csv", filename=filename)
    session.add(batch)
    session.flush()  # assign batch.id without committing — keeps the import atomic
    batch_id = batch.id

    added = 0
    duplicate = 0
    seen: set[str] = set()
    for row in parsed:
        normalized = normalize_description(row.description)
        h = dedupe_hash(account_id, row.date, row.amount_cents, normalized)
        if h in existing or h in seen:
            duplicate += 1
            continue
        seen.add(h)
        session.add(
            Transaction(
                account_id=account_id,
                date=row.date,
                description=row.description,
                merchant=normalized,
                amount_cents=row.amount_cents,
                direction=row.direction,
                source="csv",
                import_batch_id=batch_id,
                dedupe_hash=h,
                category_id=match_category(rules, normalized, row.description),
            )
        )
        added += 1

    batch.added_count = added
    batch.duplicate_count = duplicate
    session.add(batch)
    # Single commit persists the batch and its transactions together (atomic):
    # if anything in the loop had failed, nothing is left stranded.
    session.commit()
    return ImportResult(batch_id=batch_id, added_count=added, duplicate_count=duplicate)


def delete_batch(session: Session, batch_id: int) -> None:
    txns = session.exec(
        select(Transaction).where(Transaction.import_batch_id == batch_id)
    ).all()
    for txn in txns:
        session.delete(txn)
    batch = session.get(ImportBatch, batch_id)
    if batch is not None:
        session.delete(batch)
    session.commit()
