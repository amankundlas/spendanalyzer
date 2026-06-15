from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app.models import AuthSetting
from app.security import hash_password, verify_password

router = APIRouter()


class PasswordBody(BaseModel):
    password: str = Field(min_length=1)


class ChangeBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=1)


def _get_setting(session: Session) -> AuthSetting:
    setting = session.get(AuthSetting, 1)
    if setting is None:
        setting = AuthSetting(id=1, password_hash=None)
        session.add(setting)
        session.commit()
        session.refresh(setting)
    return setting


def require_auth(request: Request) -> None:
    if not request.session.get("auth"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")


@router.get("/auth/status")
def auth_status(request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    return {
        "configured": bool(setting.password_hash),
        "authenticated": bool(request.session.get("auth")),
    }


@router.post("/auth/setup")
def auth_setup(body: PasswordBody, request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if setting.password_hash:
        raise HTTPException(status_code=400, detail="password already set")
    setting.password_hash = hash_password(body.password)
    session.add(setting)
    session.commit()
    request.session["auth"] = True
    return {"ok": True}


@router.post("/auth/login")
def auth_login(body: PasswordBody, request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if not verify_password(body.password, setting.password_hash):
        raise HTTPException(status_code=401, detail="invalid password")
    request.session["auth"] = True
    return {"ok": True}


@router.post("/auth/logout")
def auth_logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@router.post("/auth/change-password", dependencies=[Depends(require_auth)])
def change_password(body: ChangeBody, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if not verify_password(body.current_password, setting.password_hash):
        raise HTTPException(status_code=400, detail="current password incorrect")
    setting.password_hash = hash_password(body.new_password)
    session.add(setting)
    session.commit()
    return {"ok": True}
