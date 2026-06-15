from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.services.dashboard import dashboard_summary

router = APIRouter()


@router.get("/dashboard")
def get_dashboard(
    account_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    session: Session = Depends(get_session),
) -> dict:
    return dashboard_summary(session, account_id, start, end)
