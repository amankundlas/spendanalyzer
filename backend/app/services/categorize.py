import re

from app.models import CategoryRule


def match_category(
    rules: list[CategoryRule], merchant: str | None, description: str | None
) -> int | None:
    """Return the category_id of the first matching rule, or None.

    Rules are evaluated in ascending `priority` (lower = higher precedence).
    Matching is case-insensitive against the merchant + description text.
    """
    haystack = f"{merchant or ''} {description or ''}".upper()
    for rule in sorted(rules, key=lambda r: r.priority):
        if rule.match_type == "merchant_contains":
            if rule.pattern.upper() in haystack:
                return rule.category_id
        elif rule.match_type == "regex":
            try:
                if re.search(rule.pattern, haystack, re.IGNORECASE):
                    return rule.category_id
            except re.error:
                continue  # a malformed stored regex never crashes categorization
    return None
