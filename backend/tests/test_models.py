from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models import Account, ImportBatch, Transaction


def _account(session: Session) -> Account:
    acct = Account(name="Amex Gold", type="credit", institution="Amex")
    session.add(acct)
    session.commit()
    session.refresh(acct)
    return acct


def test_account_and_transaction_persist(session: Session):
    acct = _account(session)
    txn = Transaction(
        account_id=acct.id,
        date=date(2026, 1, 5),
        description="WHOLE FOODS",
        amount_cents=-4599,
        direction="debit",
        dedupe_hash="abc",
    )
    session.add(txn)
    session.commit()

    rows = session.exec(select(Transaction).where(Transaction.account_id == acct.id)).all()
    assert len(rows) == 1
    assert rows[0].amount_cents == -4599
    assert rows[0].direction == "debit"


def test_import_batch_persists_and_links_transactions(session: Session):
    acct = _account(session)
    batch = ImportBatch(account_id=acct.id, source="csv", filename="jan.csv", added_count=1)
    session.add(batch)
    session.commit()
    session.refresh(batch)
    assert batch.id is not None
    assert batch.imported_at is not None  # default_factory ran

    txn = Transaction(
        account_id=acct.id,
        date=date(2026, 1, 5),
        description="WHOLE FOODS",
        amount_cents=-4599,
        direction="debit",
        dedupe_hash="hx",
        import_batch_id=batch.id,
    )
    session.add(txn)
    session.commit()
    assert session.get(Transaction, txn.id).import_batch_id == batch.id


def test_duplicate_hash_within_account_is_rejected(session: Session):
    acct = _account(session)
    common = dict(
        account_id=acct.id,
        date=date(2026, 1, 5),
        description="WHOLE FOODS",
        amount_cents=-4599,
        direction="debit",
        dedupe_hash="dup",
    )
    session.add(Transaction(**common))
    session.commit()
    session.add(Transaction(**common))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()
