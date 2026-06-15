from pathlib import Path

from sqlmodel import Session, select

from app.models import Account, Transaction
from app.services.watcher import scan_once

CSV = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"


def test_scan_imports_csv_into_matching_account(session: Session, tmp_path: Path):
    acct = Account(name="Amex Gold", type="credit")
    session.add(acct)
    session.commit()

    folder = tmp_path / "Amex Gold"
    folder.mkdir()
    (folder / "jan.csv").write_text(CSV)

    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["imported_files"] == 1

    txns = session.exec(select(Transaction)).all()
    assert len(txns) == 2
    assert not (folder / "jan.csv").exists()
    assert (folder / "_processed" / "jan.csv").exists()


def test_scan_skips_unknown_account_folder(session: Session, tmp_path: Path):
    (tmp_path / "NoSuchAccount").mkdir()
    (tmp_path / "NoSuchAccount" / "x.csv").write_text(CSV)
    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["imported_files"] == 0
    assert session.exec(select(Transaction)).all() == []


def test_scan_moves_unparseable_to_failed(session: Session, tmp_path: Path):
    acct = Account(name="Card", type="credit")
    session.add(acct)
    session.commit()
    folder = tmp_path / "Card"
    folder.mkdir()
    (folder / "bad.csv").write_text("not,a,valid\nstatement,at,all\n")

    summary = scan_once(str(tmp_path), session_factory=lambda: session)
    assert summary["failed_files"] == 1
    assert (folder / "_failed" / "bad.csv").exists()
