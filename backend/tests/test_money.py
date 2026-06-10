import pytest

from app.money import cents_to_dollars, parse_amount_to_cents


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("12.34", 1234),
        ("$1,234.56", 123456),
        ("(45.00)", -4500),     # accounting negative
        ("-7.5", -750),
        ("  89 ", 8900),
        ("0", 0),
    ],
)
def test_parse_amount_to_cents(raw, expected):
    assert parse_amount_to_cents(raw) == expected


def test_parse_amount_rejects_garbage():
    with pytest.raises(ValueError):
        parse_amount_to_cents("not-a-number")


def test_cents_to_dollars():
    assert cents_to_dollars(123456) == 1234.56
    assert cents_to_dollars(-4500) == -45.0
