import json

import httpx
import pytest

from app.services.ollama import ExtractionError, OllamaExtractor


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


def test_extract_sets_context_window_option(monkeypatch):
    """The request must pin num_ctx so Ollama never silently truncates the prompt."""
    seen = {}

    def fake_post(url, json=None, timeout=None):
        seen["json"] = json
        seen["timeout"] = timeout
        return _R({"response": '{"transactions": []}'})

    monkeypatch.setattr(httpx, "post", fake_post)
    OllamaExtractor("http://llm:11434", "m", num_ctx=8192, timeout=300).extract("x")
    assert seen["json"]["options"]["num_ctx"] == 8192
    assert seen["timeout"] == 300


def test_extract_chunks_large_text_and_merges(monkeypatch):
    """Large statements are split into multiple bounded calls and merged."""
    calls = []

    def fake_post(url, json=None, timeout=None):
        i = len(calls)
        calls.append(json["prompt"])
        return _R({"response": json_dumps_txn(f"TXN-{i}")})

    def json_dumps_txn(desc):
        return json.dumps({"transactions": [{"date": "2026-01-02", "description": desc, "amount": -1}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    # ~200 lines well over a single chunk's char budget -> multiple calls
    text = "\n".join(f"2026-01-02 MERCHANT NUMBER {n:04d} -12.34" for n in range(200))
    out = OllamaExtractor("http://llm:11434", "m", chunk_chars=1500).extract(text)
    assert len(calls) > 1  # actually chunked
    descs = [t["description"] for t in out]
    assert descs == [f"TXN-{i}" for i in range(len(calls))]  # every chunk merged, in order


def test_extract_raises_on_transport_error(monkeypatch):
    """A timeout/500 from Ollama must surface as an error, not a silent empty list."""
    def boom(url, json=None, timeout=None):
        raise httpx.TimeoutException("model too slow")

    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(ExtractionError):
        OllamaExtractor("http://llm:11434", "m").extract("some statement text")


def test_get_extractor_uses_dedicated_extract_model(monkeypatch):
    """Extraction must run on ollama_extract_model (fast 3B), not the 7B categorizer model."""
    from app.config import Settings
    from app.services import ollama

    monkeypatch.setattr(
        ollama,
        "get_settings",
        lambda: Settings(ollama_model="qwen2.5:7b-instruct", ollama_extract_model="qwen2.5:3b-instruct"),
    )
    assert ollama.get_extractor().model == "qwen2.5:3b-instruct"


def test_extract_empty_text_makes_no_calls(monkeypatch):
    calls = []
    monkeypatch.setattr(httpx, "post", lambda url, json=None, timeout=None: calls.append(1) or _R({"response": "{}"}))
    assert OllamaExtractor("http://llm:11434", "m").extract("   \n  ") == []
    assert calls == []
