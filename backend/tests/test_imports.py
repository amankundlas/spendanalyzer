from sqlmodel import Session, select

from app.models import Account, ImportBatch, Transaction
from app.schemas import ColumnMapping
from app.services.imports import commit_import, delete_batch, preview_import

CSV = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
MAPPING = ColumnMapping(date="Date", description="Description", amount="Amount")


def _account(session: Session) -> Account:
    a = Account(name="Card", type="credit")
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


def test_preview_counts_new_and_duplicates(session: Session):
    acct = _account(session)
    preview = preview_import(session, acct.id, CSV, MAPPING)
    assert preview.added_count == 2
    assert preview.duplicate_count == 0
    assert len(preview.rows) == 2


def test_commit_persists_and_dedupes_on_reimport(session: Session):
    acct = _account(session)
    first = commit_import(session, acct.id, "jan.csv", CSV, MAPPING)
    assert first.added_count == 2
    assert first.duplicate_count == 0
    assert len(session.exec(select(Transaction)).all()) == 2

    second = commit_import(session, acct.id, "jan-again.csv", CSV, MAPPING)
    assert second.added_count == 0
    assert second.duplicate_count == 2
    assert len(session.exec(select(Transaction)).all()) == 2  # no new rows

    batches = session.exec(select(ImportBatch)).all()
    assert len(batches) == 2
    assert batches[0].added_count == 2


def test_delete_batch_removes_only_its_transactions(session: Session):
    acct = _account(session)
    result = commit_import(session, acct.id, "jan.csv", CSV, MAPPING)
    delete_batch(session, result.batch_id)
    assert session.exec(select(Transaction)).all() == []
    assert session.exec(select(ImportBatch)).all() == []
