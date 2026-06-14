import json

import httpx

from app.config import get_settings

_TIMEOUT = 120.0  # a cold model load + inference can take a while


class OllamaCategorizer:
    """Categorize a transaction into one of the given category names via Ollama.

    Talks ONLY to the local Ollama service (never a cloud API). Returns the
    chosen category name (which must be one of the provided names) or None.
    """

    def __init__(self, base_url: str, model: str, keep_alive: str | int = 0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.keep_alive = keep_alive

    def _prompt(self, merchant: str, description: str, names: list[str]) -> str:
        options = ", ".join(names)
        return (
            "You categorize a single bank/credit-card transaction.\n"
            f"Allowed categories: {options}.\n"
            'Respond ONLY as JSON: {"category": "<one of the allowed categories>"} '
            'or {"category": null} if none clearly fit.\n'
            f"Transaction merchant: {merchant!r}\n"
            f"Transaction description: {description!r}\n"
        )

    def categorize_one(
        self, merchant: str | None, description: str | None, names: list[str]
    ) -> str | None:
        prompt = self._prompt(merchant or "", description or "", names)
        try:
            resp = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "keep_alive": self.keep_alive,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            content = resp.json().get("response", "")
            chosen = json.loads(content).get("category")
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError):
            return None
        return chosen if chosen in names else None


def get_categorizer() -> OllamaCategorizer:
    s = get_settings()
    return OllamaCategorizer(s.ollama_url, s.ollama_model, keep_alive="60s")
