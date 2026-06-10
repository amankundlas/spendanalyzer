from datetime import date

from app.dedupe import dedupe_hash, normalize_description


def test_normalize_description_collapses_and_uppercases():
    assert normalize_description("  Whole   Foods  #123 ") == "WHOLE FOODS #123"


def test_dedupe_hash_is_stable_and_field_sensitive():
    h1 = dedupe_hash(1, date(2026, 1, 2), -1234, "WHOLE FOODS")
    h2 = dedupe_hash(1, date(2026, 1, 2), -1234, "WHOLE FOODS")
    h3 = dedupe_hash(1, date(2026, 1, 2), -1235, "WHOLE FOODS")
    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64  # sha256 hex
