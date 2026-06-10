import re
from decimal import Decimal, InvalidOperation

_CLEAN = re.compile(r"[,$\s]")


def parse_amount_to_cents(raw: str) -> int:
    """Parse a currency string into signed integer cents.

    Handles thousands separators, currency symbols, leading/trailing spaces,
    and accounting-style negatives like "(45.00)".
    """
    s = raw.strip()
    if not s:
        raise ValueError("empty amount")
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]
    s = _CLEAN.sub("", s)
    if s.startswith("-"):
        negative = True
        s = s[1:]
    try:
        value = Decimal(s)
    except InvalidOperation as exc:
        raise ValueError(f"invalid amount: {raw!r}") from exc
    cents = int((value * 100).to_integral_value())
    return -cents if negative else cents


def cents_to_dollars(cents: int) -> float:
    return cents / 100
