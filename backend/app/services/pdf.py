import io
import re

import pdfplumber
from dateutil import parser as dateparser

from app.money import parse_amount_to_cents
from app.schemas import ParsedRow, Reconciliation


def extract_text(data: bytes) -> str:
    """Extract all text from a PDF's pages (joined by newlines)."""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


# A transaction line must START with a date. Summary lines ("Previous Balance …",
# "Total Fees …") have no leading date and are skipped.
_DATE = (
    r"\d{1,2}/\d{1,2}(?:/\d{2,4})?"          # 05/14/2026, 05/14/26, 05/14
    r"|\d{4}-\d{2}-\d{2}"                     # 2026-05-14
    r"|\d{1,2}-\d{1,2}-\d{2,4}"              # 05-14-2026
    r"|[A-Z][a-z]{2}\.?\s+\d{1,2}(?:,\s*\d{4})?"  # May 14, 2026 / May 14
    r"|\d{1,2}\s+[A-Z][a-z]{2}\.?(?:\s+\d{4})?"   # 14 May 2026 / 14 May
)
_DATE_RE = re.compile(r"^\s*(" + _DATE + r")\b")

# Amount at end of line: optional $/sign/parens, thousands, REQUIRED decimals
# (so stray integers like account fragments aren't misread as money).
_AMOUNT_RE = re.compile(
    r"""(?P<paren>\()?\s*(?P<lead>-)?\s*\$?\s*
        (?P<num>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})
        \s*\)?(?P<trail>-|CR|DR)?\s*$""",
    re.VERBOSE | re.IGNORECASE,
)


def parse_statement_text(text: str) -> list[dict]:
    """Deterministically pull transactions from statement text — no LLM.

    Each transaction line is expected to start with a date and end with an amount,
    with the description in between. Sign uses the credit-card convention: an
    unsigned amount is a charge (negative / spend); an explicit negative marker
    (leading "-", parentheses, or a trailing "-"/"CR") is a credit (positive).
    Lines without both a leading date and a trailing amount are ignored.
    """
    rows: list[dict] = []
    for raw in text.splitlines():
        line = raw.strip()
        date_match = _DATE_RE.match(line)
        if not date_match:
            continue
        amount_match = _AMOUNT_RE.search(line)
        if not amount_match:
            continue
        description = line[date_match.end() : amount_match.start()].strip()
        if not description:
            continue
        magnitude = float(amount_match.group("num").replace(",", ""))
        trail = (amount_match.group("trail") or "").upper()
        is_credit = bool(amount_match.group("paren")) or bool(amount_match.group("lead")) or trail in ("-", "CR")
        rows.append(
            {
                "date": date_match.group(1),
                "description": description,
                "amount": magnitude if is_credit else -magnitude,
            }
        )
    return rows


# A money token anywhere in a line (for summary/balance lines).
_MONEY_TOKEN = re.compile(r"\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?", re.IGNORECASE)


def _find_balance(text: str, label: str) -> int | None:
    """Return the cents value on the first line matching `label`, or None.

    Uses the last money token on the line (e.g. "Previous Balance ... 1,000.00").
    A trailing "CR" marks a credit balance (negative amount owed).
    """
    label_re = re.compile(label, re.IGNORECASE)
    for line in text.splitlines():
        if not label_re.search(line):
            continue
        tokens = list(_MONEY_TOKEN.finditer(line))
        if not tokens:
            continue
        last = tokens[-1]
        try:
            cents = parse_amount_to_cents(last.group(0))
        except ValueError:
            continue
        if line[last.end() :].lstrip()[:2].upper() == "CR":
            cents = -abs(cents)
        return cents
    return None


def reconcile_statement(text: str, rows: list[ParsedRow]) -> Reconciliation:
    """Cross-check captured rows against the statement's printed balances.

    Balance identity (our sign convention: charges negative, credits positive):
        Previous Balance − New Balance  ==  sum of all captured amounts (net)
    A match means nothing was missed; a mismatch reports the unaccounted net.
    """
    charges_cents = sum(-r.amount_cents for r in rows if r.amount_cents < 0)
    credits_cents = sum(r.amount_cents for r in rows if r.amount_cents > 0)
    net_cents = sum(r.amount_cents for r in rows)

    recon = Reconciliation(
        status="unverified",
        captured_count=len(rows),
        captured_charges=round(charges_cents / 100, 2),
        captured_credits=round(credits_cents / 100, 2),
        captured_net=round(net_cents / 100, 2),
    )

    previous = _find_balance(text, r"previous\s+balance")
    new = _find_balance(text, r"new\s+balance")
    if previous is not None and new is not None:
        statement_net = previous - new
        diff = statement_net - net_cents
        recon.previous_balance = round(previous / 100, 2)
        recon.new_balance = round(new / 100, 2)
        recon.statement_net = round(statement_net / 100, 2)
        recon.difference = round(diff / 100, 2)
        recon.status = "match" if diff == 0 else "mismatch"
    return recon


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
