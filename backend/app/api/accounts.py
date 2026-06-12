from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account

router = APIRouter()


class AccountCreate(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(pattern="^(credit|checking|savings)$")
    institution: str | None = None
    currency: str = Field(default="USD", min_length=1)


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    type: str | None = Field(default=None, pattern="^(credit|checking|savings)$")
    institution: str | None = None
    currency: str | None = Field(default=None, min_length=1)


@router.post("/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
def create_account(body: AccountCreate, session: Session = Depends(get_session)) -> Account:
    account = Account(**body.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.get("/accounts", response_model=list[Account])
def list_accounts(
    include_archived: bool = False, session: Session = Depends(get_session)
) -> list[Account]:
    query = select(Account)
    if not include_archived:
        query = query.where(Account.archived == False)  # noqa: E712
    return list(session.exec(query))


@router.patch("/accounts/{account_id}", response_model=Account)
def update_account(
    account_id: int, body: AccountUpdate, session: Session = Depends(get_session)
) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_account(account_id: int, session: Session = Depends(get_session)) -> None:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    account.archived = True
    session.add(account)
    session.commit()
