from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import Budget
from app.money import cents_to_dollars

router = APIRouter()


class BudgetUpsert(BaseModel):
    category_id: int
    month: str = "recurring"
    limit: float = Field(ge=0)


class BudgetOut(BaseModel):
    id: int
    category_id: int
    month: str
    limit: float


def _out(b: Budget) -> BudgetOut:
    return BudgetOut(
        id=b.id, category_id=b.category_id, month=b.month, limit=cents_to_dollars(b.limit_cents)
    )


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(session: Session = Depends(get_session)) -> list[BudgetOut]:
    return [_out(b) for b in session.exec(select(Budget))]


@router.put("/budgets", response_model=BudgetOut)
def upsert_budget(body: BudgetUpsert, session: Session = Depends(get_session)) -> BudgetOut:
    limit_cents = round(body.limit * 100)
    existing = session.exec(
        select(Budget).where(
            Budget.category_id == body.category_id, Budget.month == body.month
        )
    ).first()
    if existing is not None:
        existing.limit_cents = limit_cents
        session.commit()
        session.refresh(existing)
        return _out(existing)
    budget = Budget(category_id=body.category_id, month=body.month, limit_cents=limit_cents)
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _out(budget)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, session: Session = Depends(get_session)) -> None:
    budget = session.get(Budget, budget_id)
    if budget is None:
        raise HTTPException(status_code=404, detail="budget not found")
    session.delete(budget)
    session.commit()
