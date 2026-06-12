import pytest

from app.schemas import ColumnMapping
from app.services.csv_import import parse_rows

SIGNED = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
SPLIT = "Posted,Payee,Debit,Credit\n01/02/2026,WHOLE FOODS,45.99,\n01/03/2026,PAYROLL,,1500.00\n"


def test_parse_signed_amount():
    mapping = ColumnMapping(date="Date", description="Description", amount="Amount")
    rows = parse_rows(SIGNED, mapping)
    assert len(rows) == 2
    assert rows[0].amount_cents == -4599
    assert rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000
    assert rows[1].direction == "credit"


def test_parse_split_debit_credit():
    mapping = ColumnMapping(date="Posted", description="Payee", debit="Debit", credit="Credit")
    rows = parse_rows(SPLIT, mapping)
    assert rows[0].amount_cents == -4599   # debit -> negative
    assert rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000  # credit -> positive
    assert rows[1].direction == "credit"


def test_parse_skips_blank_lines_and_raises_on_bad_date():
    bad = "Date,Description,Amount\n2026-01-02,OK,-1.00\n\nNOTADATE,BAD,-2.00\n"
    mapping = ColumnMapping(date="Date", description="Description", amount="Amount")
    with pytest.raises(ValueError):
        parse_rows(bad, mapping)


def test_parse_debit_positive_false_keeps_signed_value():
    # Debit column already holds signed/negative values (some UK/EU banks).
    csv_text = "Date,Description,Debit,Credit\n2026-01-02,WHOLE FOODS,-45.99,\n"
    mapping = ColumnMapping(
        date="Date", description="Description", debit="Debit", credit="Credit",
        debit_positive=False,
    )
    rows = parse_rows(csv_text, mapping)
    assert rows[0].amount_cents == -4599
    assert rows[0].direction == "debit"


def test_parse_raises_valueerror_on_missing_mapped_column():
    # A bad mapping (column not in CSV) must raise ValueError, not KeyError,
    # so the API layer can return 400 rather than leaking a 500.
    mapping = ColumnMapping(date="Date", description="Description", amount="NOPE")
    with pytest.raises(ValueError):
        parse_rows(SIGNED, mapping)


def test_parse_strips_utf8_bom():
    bom = "﻿Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n"
    mapping = ColumnMapping(date="Date", description="Description", amount="Amount")
    rows = parse_rows(bom, mapping)
    assert len(rows) == 1
    assert rows[0].amount_cents == -4599
