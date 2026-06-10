from datetime import UTC, date, datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Account(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    type: str  # "credit" | "checking" | "savings"
    institution: str | None = None
    currency: str = "USD"
    archived: bool = False


class ImportBatch(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    source: str  # "csv" | "manual"
    filename: str
    imported_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    added_count: int = 0
    duplicate_count: int = 0


class Transaction(SQLModel, table=True):
    # A dedupe_hash is unique per account (the composite also covers the
    # account-scoped dedupe lookup, so dedupe_hash needs no separate index).
    __table_args__ = (UniqueConstraint("account_id", "dedupe_hash"),)

    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    date: date
    description: str
    merchant: str | None = None
    amount_cents: int
    direction: str  # "debit" | "credit"
    source: str = "csv"
    import_batch_id: int | None = Field(
        default=None, foreign_key="importbatch.id", index=True
    )
    dedupe_hash: str
