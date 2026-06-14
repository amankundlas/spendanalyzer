from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import CategoryRule

router = APIRouter()

_MATCH = "^(merchant_contains|regex)$"


class RuleCreate(BaseModel):
    match_type: str = Field(pattern=_MATCH)
    pattern: str = Field(min_length=1)
    category_id: int
    priority: int = 100


class RuleUpdate(BaseModel):
    match_type: str | None = Field(default=None, pattern=_MATCH)
    pattern: str | None = Field(default=None, min_length=1)
    category_id: int | None = None
    priority: int | None = None


@router.post("/rules", response_model=CategoryRule, status_code=status.HTTP_201_CREATED)
def create_rule(body: RuleCreate, session: Session = Depends(get_session)) -> CategoryRule:
    rule = CategoryRule(**body.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.get("/rules", response_model=list[CategoryRule])
def list_rules(session: Session = Depends(get_session)) -> list[CategoryRule]:
    return list(session.exec(select(CategoryRule).order_by(CategoryRule.priority)))


@router.patch("/rules/{rule_id}", response_model=CategoryRule)
def update_rule(
    rule_id: int, body: RuleUpdate, session: Session = Depends(get_session)
) -> CategoryRule:
    rule = session.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, session: Session = Depends(get_session)) -> None:
    rule = session.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    session.delete(rule)
    session.commit()
