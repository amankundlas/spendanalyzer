import shutil
from collections.abc import Callable
from pathlib import Path

from sqlmodel import Session, select

from app.db import get_engine
from app.models import Account
from app.services.csv_import import detect_columns
from app.services.imports import commit_import

_SUBDIRS = {"_processed", "_failed"}


def _default_session_factory() -> Session:
    return Session(get_engine())


def scan_once(
    watch_dir: str, session_factory: Callable[[], Session] = _default_session_factory
) -> dict:
    """Scan <watch_dir>/<account-name>/*.csv and import each into that account.

    Files move to _processed/ on success or _failed/ on error. Subfolder name is
    matched case-insensitively to a non-archived account. Idempotent: dedupe means
    re-dropping an already-imported file adds nothing.
    """
    root = Path(watch_dir)
    summary = {"imported_files": 0, "failed_files": 0}
    if not root.is_dir():
        return summary

    session = session_factory()
    try:
        accounts = {
            a.name.strip().lower(): a
            for a in session.exec(select(Account).where(Account.archived == False))  # noqa: E712
        }
        for sub in root.iterdir():
            if not sub.is_dir() or sub.name in _SUBDIRS:
                continue
            account = accounts.get(sub.name.strip().lower())
            if account is None:
                continue
            for csv_file in sorted(sub.glob("*.csv")):
                if not csv_file.is_file():
                    continue
                try:
                    text = csv_file.read_text(encoding="utf-8-sig")
                    mapping = detect_columns(text).suggested
                    commit_import(session, account.id, csv_file.name, text, mapping)
                    dest_dir = sub / "_processed"
                    summary["imported_files"] += 1
                except Exception:
                    dest_dir = sub / "_failed"
                    summary["failed_files"] += 1
                dest_dir.mkdir(exist_ok=True)
                shutil.move(str(csv_file), str(dest_dir / csv_file.name))
    finally:
        if session_factory is _default_session_factory:
            session.close()
    return summary
