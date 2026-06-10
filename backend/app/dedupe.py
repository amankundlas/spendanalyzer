import hashlib
import re
from datetime import date

_WS = re.compile(r"\s+")


def normalize_description(description: str) -> str:
    return _WS.sub(" ", description).strip().upper()


def dedupe_hash(
    account_id: int, txn_date: date, amount_cents: int, normalized_description: str
) -> str:
    key = f"{account_id}|{txn_date.isoformat()}|{amount_cents}|{normalized_description}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()
