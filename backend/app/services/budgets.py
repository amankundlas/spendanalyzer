from collections import defaultdict

from sqlmodel import Session, select

from app.models import Budget, Category, Transaction
from app.money import cents_to_dollars


def budget_status(session: Session, month: str) -> list[dict]:
    """For `month` (YYYY-MM), return actual-vs-budget per budgeted category.

    Effective limit = a per-month override (Budget.month == month) if present,
    else the recurring budget (Budget.month == "recurring").
    """
    budgets = list(session.exec(select(Budget)))
    recurring: dict[int, int] = {}
    override: dict[int, int] = {}
    for b in budgets:
        if b.month == "recurring":
            recurring[b.category_id] = b.limit_cents
        elif b.month == month:
            override[b.category_id] = b.limit_cents
    effective = {**recurring, **override}
    if not effective:
        return []

    spent: dict[int, int] = defaultdict(int)
    txns = session.exec(select(Transaction).where(Transaction.direction == "debit")).all()
    for t in txns:
        if t.category_id is not None and t.date.strftime("%Y-%m") == month:
            spent[t.category_id] += abs(t.amount_cents)

    categories = {c.id: c for c in session.exec(select(Category))}
    out = []
    for cid, limit_cents in effective.items():
        cat = categories.get(cid)
        spent_cents = spent.get(cid, 0)
        pct = (spent_cents / limit_cents) if limit_cents > 0 else 0.0
        if spent_cents > limit_cents:
            state = "over"
        elif pct >= 0.8:
            state = "near"
        else:
            state = "under"
        out.append(
            {
                "category_id": cid,
                "category_name": cat.name if cat else "?",
                "color": cat.color if cat else None,
                "month": month,
                "limit": cents_to_dollars(limit_cents),
                "spent": cents_to_dollars(spent_cents),
                "remaining": cents_to_dollars(limit_cents - spent_cents),
                "pct": round(pct, 4),
                "status": state,
            }
        )
    out.sort(key=lambda d: d["pct"], reverse=True)
    return out
