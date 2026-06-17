from datetime import date

from pydantic import BaseModel


class ColumnMapping(BaseModel):
    date: str
    description: str
    amount: str | None = None        # single signed-amount column
    debit: str | None = None         # OR a debit column ...
    credit: str | None = None        # ... and a credit column
    date_format: str | None = None   # optional explicit strptime format
    debit_positive: bool = True      # debit column holds positive magnitudes


class DetectedColumns(BaseModel):
    headers: list[str]
    sample_rows: list[dict[str, str]]
    suggested: ColumnMapping


class ParsedRow(BaseModel):
    date: date
    description: str
    amount_cents: int
    direction: str  # "debit" | "credit"


class Reconciliation(BaseModel):
    """Cross-check of captured transactions against the statement's printed totals.

    Uses the balance identity: (Previous Balance − New Balance) should equal the
    net of all captured transactions (credits positive, charges negative). A match
    means everything was captured; a mismatch reports how much is unaccounted.
    """

    status: str  # "match" | "mismatch" | "unverified"
    captured_count: int
    captured_charges: float  # total money out (magnitude, dollars)
    captured_credits: float  # total money in (magnitude, dollars)
    captured_net: float      # credits − charges (dollars)
    previous_balance: float | None = None
    new_balance: float | None = None
    statement_net: float | None = None   # previous − new (expected captured_net)
    difference: float | None = None       # statement_net − captured_net (unaccounted)


class ImportPreview(BaseModel):
    rows: list[ParsedRow]
    added_count: int
    duplicate_count: int


class ImportResult(BaseModel):
    batch_id: int
    added_count: int
    duplicate_count: int
