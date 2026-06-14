import json

import httpx

from app.services.ollama import OllamaCategorizer


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._payload


def test_categorize_one_returns_known_category(monkeypatch):
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured["url"] = url
        captured["body"] = json
        return _FakeResponse({"response": '{"category": "Groceries"}'})

    monkeypatch.setattr(httpx, "post", fake_post)

    cat = OllamaCategorizer("http://llm:11434", "qwen2.5:7b-instruct")
    result = cat.categorize_one("WHOLE FOODS", "WHOLE FOODS #1", ["Groceries", "Dining"])

    assert result == "Groceries"
    assert captured["url"] == "http://llm:11434/api/generate"
    assert captured["body"]["model"] == "qwen2.5:7b-instruct"
    assert captured["body"]["format"] == "json"
    assert captured["body"]["stream"] is False


def test_categorize_one_rejects_unknown_category(monkeypatch):
    def fake_post(url, json=None, timeout=None):
        return _FakeResponse({"response": '{"category": "Spaceships"}'})

    monkeypatch.setattr(httpx, "post", fake_post)
    cat = OllamaCategorizer("http://llm:11434", "m")
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None


def test_categorize_one_handles_null_and_bad_json(monkeypatch):
    responses = iter(['{"category": null}', "not json at all"])

    def fake_post(url, json=None, timeout=None):
        return _FakeResponse({"response": next(responses)})

    monkeypatch.setattr(httpx, "post", fake_post)
    cat = OllamaCategorizer("http://llm:11434", "m")
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None
