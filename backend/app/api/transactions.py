from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Category, Transaction
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
    category_id: int | None
    category_name: str | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


class RecategorizeBody(BaseModel):
    category_id: int | None


def _out(txn: Transaction, category_name: str | None) -> "TransactionOut":
    return TransactionOut(
        id=txn.id,
        account_id=txn.account_id,
        date=txn.date,
        description=txn.description,
        merchant=txn.merchant,
        amount=cents_to_dollars(txn.amount_cents),
        direction=txn.direction,
        import_batch_id=txn.import_batch_id,
        category_id=txn.category_id,
        category_name=category_name,
    )


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    account_id: int | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    category_id: int | None = None,
    uncategorized: bool = False,
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
    if category_id is not None:
        filters.append(Transaction.category_id == category_id)
    if uncategorized:
        filters.append(Transaction.category_id.is_(None))

    count_query = select(func.count()).select_from(Transaction)
    for f in filters:
        count_query = count_query.where(f)
    total = session.exec(count_query).one()

    query = select(Transaction, Category.name).join(
        Category, Transaction.category_id == Category.id, isouter=True
    )
    for f in filters:
        query = query.where(f)
    rows = session.exec(
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    items = [_out(t, category_name) for (t, category_name) in rows]
    return TransactionPage(items=items, total=total)


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
def recategorize(
    transaction_id: int, body: RecategorizeBody, session: Session = Depends(get_session)
) -> TransactionOut:
    txn = session.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    name = None
    if body.category_id is not None:
        cat = session.get(Category, body.category_id)
        if cat is None:
            raise HTTPException(status_code=400, detail="category not found")
        name = cat.name
    txn.category_id = body.category_id
    session.commit()
    session.refresh(txn)
    return _out(txn, name)


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int, session: Session = Depends(get_session)
) -> None:
    txn = session.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    session.delete(txn)
    session.commit()
