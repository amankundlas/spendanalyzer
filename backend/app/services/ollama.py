import json

import httpx

from app.config import get_settings

_TIMEOUT = 120.0  # a cold model load + inference can take a while

# PDF extraction defaults. Statements routinely exceed the model's default 4096-token
# context, so we (a) pin a larger context window and (b) split the text into small
# line-based chunks — each call stays fast and well inside the window, and we merge.
_EXTRACT_NUM_CTX = 8192
_EXTRACT_CHUNK_CHARS = 3500
_EXTRACT_TIMEOUT = 300.0  # CPU inference is slow; give a full statement room to finish


class ExtractionError(RuntimeError):
    """The local model failed to process a chunk (timeout, 500, connection error).

    Raised instead of silently returning a partial/empty result, so the caller can
    tell the user the import failed rather than pretending there were no transactions.
    """


def _chunk_lines(text: str, max_chars: int) -> list[str]:
    """Split text into chunks on line boundaries, each up to ~max_chars.

    Blank-only input yields no chunks (nothing to extract, so no model calls).
    """
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for line in text.splitlines():
        add = len(line) + 1
        if current and size + add > max_chars:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(line)
        size += add
    if current:
        chunks.append("\n".join(current))
    return [c for c in chunks if c.strip()]


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


class OllamaExtractor:
    """Extract structured transactions from statement text via local Ollama.

    The statement is split into small line-based chunks; each is sent to the model
    with a pinned context window, and the results are merged in order. A transport
    failure on any chunk raises ExtractionError rather than dropping data silently.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        keep_alive: str | int = "60s",
        num_ctx: int = _EXTRACT_NUM_CTX,
        chunk_chars: int = _EXTRACT_CHUNK_CHARS,
        timeout: float = _EXTRACT_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.keep_alive = keep_alive
        self.num_ctx = num_ctx
        self.chunk_chars = chunk_chars
        self.timeout = timeout

    def _prompt(self, text: str) -> str:
        return (
            "Extract every transaction from this bank/credit-card statement text.\n"
            'Respond ONLY as JSON: {"transactions": [{"date": "YYYY-MM-DD", '
            '"description": "...", "amount": <number, negative for money out>}]}.\n'
            "Use ISO dates. If none are found, return an empty list.\n\n"
            f"STATEMENT TEXT:\n{text}\n"
        )

    def _extract_chunk(self, chunk: str) -> list[dict]:
        try:
            resp = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": self._prompt(chunk),
                    "format": "json",
                    "stream": False,
                    "keep_alive": self.keep_alive,
                    "options": {"num_ctx": self.num_ctx},
                },
                timeout=self.timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:  # timeout, 5xx, connection error
            raise ExtractionError(str(exc)) from exc
        try:
            data = json.loads(resp.json().get("response", ""))
            txns = data.get("transactions", [])
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return []  # model returned junk for this chunk; treat as no rows here
        return txns if isinstance(txns, list) else []

    def extract(self, text: str) -> list[dict]:
        rows: list[dict] = []
        for chunk in _chunk_lines(text, self.chunk_chars):
            rows.extend(self._extract_chunk(chunk))
        return rows


def get_extractor() -> "OllamaExtractor":
    s = get_settings()
    return OllamaExtractor(s.ollama_url, s.ollama_extract_model)
