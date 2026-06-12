from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Transaction
from app.money import cents_to_dollars

router = APIRouter()


class TransactionOut(BaseModel):
    id: int
    account_id: int
    date: date
    description: str
    merchant: str | None
    amount: float
    direction: str
    import_batch_id: int | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    account_id: int | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> TransactionPage:
    filters = []
    if account_id is not None:
        filters.append(Transaction.account_id == account_id)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if start is not None:
        filters.append(Transaction.date >= start)
    if end is not None:
        filters.append(Transaction.date <= end)

    base = select(Transaction)
    for f in filters:
        base = base.where(f)

    count_query = select(func.count()).select_from(Transaction)
    for f in filters:
        count_query = count_query.where(f)
    total = session.exec(count_query).one()

    rows = session.exec(
        base.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit).offset(offset)
    ).all()

    items = [
        TransactionOut(
            id=t.id,
            account_id=t.account_id,
            date=t.date,
            description=t.description,
            merchant=t.merchant,
            amount=cents_to_dollars(t.amount_cents),
            direction=t.direction,
            import_batch_id=t.import_batch_id,
        )
        for t in rows
    ]
    return TransactionPage(items=items, total=total)
