import json

import httpx

from app.services.ollama import OllamaExtractor


class _R:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


def test_extract_returns_transactions(monkeypatch):
    payload = {"response": json.dumps({"transactions": [
        {"date": "2026-01-02", "description": "WHOLE FOODS", "amount": -45.99},
    ]})}
    monkeypatch.setattr(httpx, "post", lambda url, json=None, timeout=None: _R(payload))
    out = OllamaExtractor("http://llm:11434", "m").extract("...text...")
    assert out == [{"date": "2026-01-02", "description": "WHOLE FOODS", "amount": -45.99}]


def test_extract_handles_bad_json(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda url, json=None, timeout=None: _R({"response": "nope"}))
    assert OllamaExtractor("http://llm:11434", "m").extract("x") == []
