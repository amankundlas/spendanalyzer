from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = "#64748b"
    icon: str | None = None
    parent_id: int | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None


@router.post("/categories", response_model=Category, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, session: Session = Depends(get_session)) -> Category:
    category = Category(**body.model_dump())
    session.add(category)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="category name already exists") from exc
    session.refresh(category)
    return category


@router.get("/categories", response_model=list[Category])
def list_categories(session: Session = Depends(get_session)) -> list[Category]:
    return list(session.exec(select(Category).order_by(Category.name)))


@router.patch("/categories/{category_id}", response_model=Category)
def update_category(
    category_id: int, body: CategoryUpdate, session: Session = Depends(get_session)
) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="category not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="category name already exists") from exc
    session.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, session: Session = Depends(get_session)) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="category not found")
    session.delete(category)
    session.commit()
