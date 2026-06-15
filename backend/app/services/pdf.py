import io

import pdfplumber
from dateutil import parser as dateparser

from app.money import parse_amount_to_cents
from app.schemas import ParsedRow


def extract_text(data: bytes) -> str:
    """Extract all text from a PDF's pages (joined by newlines)."""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def to_parsed_rows(raw: list[dict]) -> list[ParsedRow]:
    """Convert raw {date, description, amount} dicts into ParsedRows.

    Rows that fail to parse (bad date/amount) are skipped rather than failing
    the whole import — the user reviews the result before saving.
    """
    rows: list[ParsedRow] = []
    for item in raw:
        try:
            txn_date = dateparser.parse(str(item["date"])).date()
            cents = parse_amount_to_cents(str(item["amount"]))
            description = str(item.get("description", "")).strip()
        except (KeyError, ValueError, TypeError):
            continue
        rows.append(
            ParsedRow(
                date=txn_date,
                description=description,
                amount_cents=cents,
                direction="debit" if cents < 0 else "credit",
            )
        )
    return rows
