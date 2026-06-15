from collections import defaultdict
from datetime import date

from sqlmodel import Session, select

from app.models import Category, Transaction
from app.money import cents_to_dollars


def _filtered(session: Session, account_id, start, end):
    query = select(Transaction, Category).join(
        Category, Transaction.category_id == Category.id, isouter=True
    )
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)
    if start is not None:
        query = query.where(Transaction.date >= start)
    if end is not None:
        query = query.where(Transaction.date <= end)
    return session.exec(query).all()


def dashboard_summary(
    session: Session,
    account_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
) -> dict:
    rows = _filtered(session, account_id, start, end)

    spend_cents = 0
    income_cents = 0
    count = 0
    cat_spend: dict = defaultdict(int)
    month_spend: dict = defaultdict(int)
    month_income: dict = defaultdict(int)

    for txn, category in rows:
        count += 1
        month = txn.date.strftime("%Y-%m")
        if txn.direction == "debit":
            amt = abs(txn.amount_cents)
            spend_cents += amt
            month_spend[month] += amt
            key = (
                category.id if category else None,
                category.name if category else "Uncategorized",
                category.color if category else None,
            )
            cat_spend[key] += amt
        else:
            income_cents += txn.amount_cents
            month_income[month] += txn.amount_cents

    by_category = sorted(
        (
            {
                "category_id": cid,
                "category_name": name,
                "color": color,
                "spend": cents_to_dollars(cents),
            }
            for (cid, name, color), cents in cat_spend.items()
        ),
        key=lambda d: d["spend"],
        reverse=True,
    )

    months = sorted(set(month_spend) | set(month_income))
    by_month = [
        {
            "month": m,
            "spend": cents_to_dollars(month_spend.get(m, 0)),
            "income": cents_to_dollars(month_income.get(m, 0)),
        }
        for m in months
    ]

    return {
        "totals": {
            "spend": cents_to_dollars(spend_cents),
            "income": cents_to_dollars(income_cents),
            "net": cents_to_dollars(income_cents - spend_cents),
            "count": count,
        },
        "by_category": by_category,
        "by_month": by_month,
    }
