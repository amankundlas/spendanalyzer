from app.services.pdf import to_parsed_rows


def test_to_parsed_rows_converts_and_sets_direction():
    rows = to_parsed_rows([
        {"date": "2026-01-02", "description": "WHOLE FOODS", "amount": -45.99},
        {"date": "2026-01-03", "description": "PAYROLL", "amount": 1500},
    ])
    assert len(rows) == 2
    assert rows[0].amount_cents == -4599 and rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000 and rows[1].direction == "credit"


def test_to_parsed_rows_skips_unparseable():
    rows = to_parsed_rows([
        {"date": "NOTADATE", "description": "BAD", "amount": -1},
        {"date": "2026-01-02", "description": "OK", "amount": -2.00},
    ])
    assert len(rows) == 1
    assert rows[0].description == "OK"
