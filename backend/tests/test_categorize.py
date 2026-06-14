from app.models import CategoryRule
from app.services.categorize import match_category


def _rule(match_type, pattern, category_id, priority=100):
    return CategoryRule(
        match_type=match_type, pattern=pattern, category_id=category_id, priority=priority
    )


def test_merchant_contains_matches_case_insensitively():
    rules = [_rule("merchant_contains", "whole foods", 5)]
    assert match_category(rules, "WHOLE FOODS #123", "WHOLE FOODS MARKET") == 5


def test_regex_match():
    rules = [_rule("regex", r"^SHELL", 7)]
    assert match_category(rules, "SHELL OIL", "SHELL OIL 4455") == 7


def test_priority_lower_number_wins():
    rules = [
        _rule("merchant_contains", "amazon", 1, priority=200),
        _rule("merchant_contains", "amazon", 2, priority=10),
    ]
    assert match_category(rules, "AMAZON MKTP", "AMAZON") == 2


def test_no_match_returns_none():
    rules = [_rule("merchant_contains", "costco", 3)]
    assert match_category(rules, "TARGET", "TARGET STORE") is None


def test_malformed_regex_is_skipped_not_raised():
    rules = [_rule("regex", "(", 9)]  # invalid regex
    assert match_category(rules, "ANYTHING", "ANYTHING") is None
