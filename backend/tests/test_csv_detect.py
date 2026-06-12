from app.services.csv_import import detect_columns

SIGNED = "Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n2026-01-03,PAYROLL,1500.00\n"
SPLIT = "Posted,Payee,Debit,Credit\n01/02/2026,WHOLE FOODS,45.99,\n01/03/2026,PAYROLL,,1500.00\n"


def test_detects_signed_amount_layout():
    d = detect_columns(SIGNED)
    assert d.headers == ["Date", "Description", "Amount"]
    assert d.suggested.date == "Date"
    assert d.suggested.description == "Description"
    assert d.suggested.amount == "Amount"
    assert d.suggested.debit is None and d.suggested.credit is None
    assert len(d.sample_rows) == 2


def test_detects_split_debit_credit_layout():
    d = detect_columns(SPLIT)
    assert d.suggested.date == "Posted"
    assert d.suggested.description == "Payee"
    assert d.suggested.debit == "Debit"
    assert d.suggested.credit == "Credit"
    assert d.suggested.amount is None


def test_balance_and_credit_limit_columns_are_not_mistaken_for_amount():
    # "Credit Limit" / "Available Credit" / "Balance" must not hijack detection.
    text = (
        "Date,Description,Amount,Credit Limit,Available Credit,Balance\n"
        "2026-01-02,WHOLE FOODS,-45.99,5000,4954.01,-45.99\n"
    )
    d = detect_columns(text)
    assert d.suggested.amount == "Amount"
    assert d.suggested.debit is None
    assert d.suggested.credit is None
