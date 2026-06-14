from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.accounts import router as accounts_router
from app.api.categories import router as categories_router
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
app.include_router(health_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(rules_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
