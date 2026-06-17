from app.services.pdf import parse_statement_text, to_parsed_rows


def test_parse_statement_text_basic_credit_card_lines():
    text = (
        "Transactions\n"
        "05/14/2026  AMAZON.COM*A1B2C3        42.17\n"
        "05/16/2026  WHOLE FOODS MARKET #123  108.90\n"
        "05/20/2026  PAYMENT THANK YOU       -500.00\n"
    )
    rows = parse_statement_text(text)
    assert len(rows) == 3
    # Unsigned amounts on a credit statement are charges -> negative (spend)
    assert rows[0] == {"date": "05/14/2026", "description": "AMAZON.COM*A1B2C3", "amount": -42.17}
    assert rows[1]["amount"] == -108.90
    # Explicit-negative (payment/credit) -> positive (money in)
    assert rows[2]["description"] == "PAYMENT THANK YOU"
    assert rows[2]["amount"] == 500.00


def test_parse_statement_text_handles_formats_and_skips_noise():
    text = (
        "Previous Balance               1,234.56\n"   # no leading date -> skipped
        "Account ending 9876\n"                        # no amount -> skipped
        "2026-05-02  TRADER JOE'S #42      1,012.34\n"  # ISO date + thousands
        "05/03  STARBUCKS                  (6.75)\n"    # short date + parens credit
        "Total Fees                         0.00\n"     # no date -> skipped
    )
    rows = parse_statement_text(text)
    descs = [r["description"] for r in rows]
    assert descs == ["TRADER JOE'S #42", "STARBUCKS"]
    assert rows[0]["amount"] == -1012.34            # charge
    assert rows[1]["amount"] == 6.75                # parenthesized -> credit (positive)


def test_parse_statement_text_empty_when_no_transactions():
    assert parse_statement_text("Just some header text\nwith no transactions\n") == []


def test_parsed_rows_round_trip_from_parser():
    rows = to_parsed_rows(parse_statement_text("05/14/2026  COFFEE SHOP   4.50\n"))
    assert len(rows) == 1
    assert rows[0].amount_cents == -450 and rows[0].direction == "debit"


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
