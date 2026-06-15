import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api.accounts import router as accounts_router
from app.api.auth import require_auth
from app.api.auth import router as auth_router
from app.api.budgets import router as budgets_router
from app.api.categories import router as categories_router
from app.api.categorize import router as categorize_router
from app.api.dashboard import router as dashboard_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.rules import router as rules_router
from app.api.transactions import router as transactions_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=get_settings().session_secret or secrets.token_hex(32),
    same_site="lax",
    https_only=False,
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

_guard = [Depends(require_auth)]
app.include_router(accounts_router, prefix="/api", dependencies=_guard)
app.include_router(categories_router, prefix="/api", dependencies=_guard)
app.include_router(rules_router, prefix="/api", dependencies=_guard)
app.include_router(categorize_router, prefix="/api", dependencies=_guard)
app.include_router(imports_router, prefix="/api", dependencies=_guard)
app.include_router(transactions_router, prefix="/api", dependencies=_guard)
app.include_router(dashboard_router, prefix="/api", dependencies=_guard)
app.include_router(budgets_router, prefix="/api", dependencies=_guard)
