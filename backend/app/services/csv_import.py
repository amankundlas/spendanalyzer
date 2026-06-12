import csv
import io

from dateutil import parser as dateparser

from app.money import parse_amount_to_cents
from app.schemas import ColumnMapping, DetectedColumns, ParsedRow

_DATE_HINTS = ("date", "posted", "transaction date", "trans date")
_DESC_HINTS = ("description", "payee", "name", "memo", "details", "merchant")
_AMOUNT_HINTS = ("amount", "value")
_DEBIT_HINTS = ("debit", "withdrawal", "withdrawals", "charge")
_CREDIT_HINTS = ("credit", "deposit", "deposits", "payment")
# Headers containing these are running balances / limits, never the transaction
# amount column — exclude them from amount/debit/credit detection.
_NOISE = ("balance", "limit", "available", "avail", "running")


def _read(text: str) -> tuple[list[str], list[dict[str, str]]]:
    # Strip a UTF-8 BOM (common in Excel/Windows bank exports) so the first
    # header isn't silently corrupted to "﻿Date".
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    headers = reader.fieldnames or []
    rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    return headers, rows


def _match(
    headers: list[str], hints: tuple[str, ...], exclude: tuple[str, ...] = ()
) -> str | None:
    candidates = [
        h for h in headers if h and not any(x in h.strip().lower() for x in exclude)
    ]
    for h in candidates:  # exact match first
        if h.strip().lower() in hints:
            return h
    for h in candidates:  # then substring fallback
        low = h.strip().lower()
        if any(hint in low for hint in hints):
            return h
    return None


def detect_columns(text: str) -> DetectedColumns:
    headers, rows = _read(text)
    debit = _match(headers, _DEBIT_HINTS, exclude=_NOISE)
    credit = _match(headers, _CREDIT_HINTS, exclude=_NOISE)
    amount = None if (debit and credit) else _match(headers, _AMOUNT_HINTS, exclude=_NOISE)
    suggested = ColumnMapping(
        date=_match(headers, _DATE_HINTS) or (headers[0] if headers else ""),
        description=_match(headers, _DESC_HINTS) or (headers[1] if len(headers) > 1 else ""),
        amount=amount,
        debit=debit if (debit and credit) else None,
        credit=credit if (debit and credit) else None,
    )
    return DetectedColumns(headers=headers, sample_rows=rows[:5], suggested=suggested)


def _parse_date(value: str, fmt: str | None):
    value = value.strip()
    if fmt:
        from datetime import datetime

        return datetime.strptime(value, fmt).date()
    return dateparser.parse(value).date()


def _require_columns(headers: list[str], mapping: ColumnMapping) -> None:
    needed = [mapping.date, mapping.description]
    if mapping.amount:
        needed.append(mapping.amount)
    else:
        needed.extend(c for c in (mapping.debit, mapping.credit) if c)
    missing = [c for c in needed if c and c not in headers]
    if missing:
        raise ValueError(f"mapped column(s) not found in CSV: {missing}")


def parse_rows(text: str, mapping: ColumnMapping) -> list[ParsedRow]:
    headers, rows = _read(text)
    _require_columns(headers, mapping)
    out: list[ParsedRow] = []
    for r in rows:
        txn_date = _parse_date(r.get(mapping.date, ""), mapping.date_format)
        description = (r.get(mapping.description) or "").strip()
        if mapping.amount:
            cents = parse_amount_to_cents(r[mapping.amount])
            direction = "debit" if cents < 0 else "credit"
        else:
            debit_raw = (r.get(mapping.debit) or "").strip() if mapping.debit else ""
            credit_raw = (r.get(mapping.credit) or "").strip() if mapping.credit else ""
            if debit_raw:
                value = parse_amount_to_cents(debit_raw)
                # debit_positive: the debit column holds positive magnitudes, so
                # negate to a debit. Otherwise the column is already signed.
                cents = -abs(value) if mapping.debit_positive else value
                direction = "debit"
            elif credit_raw:
                cents = abs(parse_amount_to_cents(credit_raw))
                direction = "credit"
            else:
                continue  # neither column populated -> skip row
        out.append(
            ParsedRow(
                date=txn_date,
                description=description,
                amount_cents=cents,
                direction=direction,
            )
        )
    return out
