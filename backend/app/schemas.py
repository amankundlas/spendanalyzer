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
