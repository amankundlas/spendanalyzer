# Spend Analyzer — Phase 3b: Local-LLM Categorization of Unknowns — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Use the local Ollama model to categorize the transactions that the deterministic rules did NOT catch. A user-triggered "Categorize with AI" action runs the LLM over uncategorized transactions and assigns categories. Plus the carried-over deploy hardening (pin Ollama image, nginx timeouts, model pull on deploy).

**Architecture:** An injectable `OllamaCategorizer` (httpx → Ollama `/api/generate`, `format=json`) maps a transaction to one of the existing category names (or null). A service runs it over uncategorized rows. The endpoint depends on `get_categorizer()` (overridable in tests, so the suite never needs a real LLM). Batch requests pass `keep_alive` to keep the model warm during the operation, then it unloads. The real model behavior is verified post-deploy on the minipc; Mac tests mock the HTTP layer.

**Tech Stack:** httpx (new runtime dep), FastAPI, SQLModel. The LLM call only works on the minipc (where Ollama + the model live); all Mac tests mock it.

**Privacy:** financial text goes ONLY to the local Ollama service on the minipc — never to any cloud API. (Matches the project's non-negotiable rule.)

**Conventions:** TDD with mocked HTTP/categorizer on the Mac. One commit per task. Deploy + live LLM smoke test is the final task. Out of scope: PDF import (3c), learn-as-rule (later).

---

## Task 1: Ollama client (TDD, mocked HTTP)

**Files:** modify `backend/requirements.txt`; create `backend/app/services/ollama.py`, `backend/tests/test_ollama.py`.

- [ ] **Step 1: Add httpx to `backend/requirements.txt`** (it's already a dev dep via TestClient; make it a runtime dep):
```
httpx==0.28.1
```

- [ ] **Step 2: Write failing test** — `backend/tests/test_ollama.py`:
```python
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
        # Ollama returns the model text in "response"; format=json => valid JSON string
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
    # model hallucinated a category not in the list -> None
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None


def test_categorize_one_handles_null_and_bad_json(monkeypatch):
    responses = iter(['{"category": null}', "not json at all"])

    def fake_post(url, json=None, timeout=None):
        return _FakeResponse({"response": next(responses)})

    monkeypatch.setattr(httpx, "post", fake_post)
    cat = OllamaCategorizer("http://llm:11434", "m")
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None  # explicit null
    assert cat.categorize_one("X", "Y", ["Groceries"]) is None  # unparseable -> None, no raise
```

- [ ] **Step 3: Run RED** — `cd backend && . .venv/bin/activate && pytest -q tests/test_ollama.py` → FAIL.

- [ ] **Step 4: Write `backend/app/services/ollama.py`:**
```python
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
            "Respond ONLY as JSON: {\"category\": \"<one of the allowed categories>\"} "
            "or {\"category\": null} if none clearly fit.\n"
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
    # keep the model warm during a batch op; the container's OLLAMA_KEEP_ALIVE=0
    # default still unloads promptly once this window passes.
    return OllamaCategorizer(s.ollama_url, s.ollama_model, keep_alive="60s")
```

- [ ] **Step 5: Run GREEN** — `pytest -q tests/test_ollama.py` then full `pytest -q -W error::DeprecationWarning` → all green. Report.

- [ ] **Step 6: Commit:**
```bash
git add backend/requirements.txt backend/app/services/ollama.py backend/tests/test_ollama.py
git commit -m "feat(api): Ollama categorizer client (local LLM, JSON, mocked-HTTP tests)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: AI-categorize service + endpoint (TDD, injected fake categorizer)

**Files:** create `backend/app/services/llm_categorize.py`, `backend/app/api/categorize.py`, `backend/tests/test_ai_categorize.py`; register router in `main.py`.

- [ ] **Step 1: Write `backend/app/services/llm_categorize.py`:**
```python
from sqlmodel import Session, select

from app.models import Category, Transaction


def ai_categorize_uncategorized(session: Session, categorizer) -> int:
    """Run the LLM over uncategorized transactions; assign known categories.

    `categorizer` is any object with
    `categorize_one(merchant, description, names) -> str | None`.
    Returns the number of transactions updated.
    """
    categories = list(session.exec(select(Category)))
    names = [c.name for c in categories]
    name_to_id = {c.name: c.id for c in categories}
    if not names:
        return 0

    txns = list(session.exec(select(Transaction).where(Transaction.category_id.is_(None))))
    updated = 0
    for txn in txns:
        chosen = categorizer.categorize_one(txn.merchant, txn.description, names)
        if chosen in name_to_id:
            txn.category_id = name_to_id[chosen]
            updated += 1
    session.commit()
    return updated
```

- [ ] **Step 2: Write failing test** — `backend/tests/test_ai_categorize.py`:
```python
import io
import json

from fastapi.testclient import TestClient

from app.main import app
from app.services.ollama import get_categorizer

CSV = "Date,Description,Amount\n2026-01-02,MYSTERY DINER,-22.00\n2026-01-03,ODD SHOP,-9.99\n"


class _FakeCategorizer:
    def __init__(self, mapping):
        self.mapping = mapping  # description substring -> category name

    def categorize_one(self, merchant, description, names):
        for needle, cat in self.mapping.items():
            if needle in (description or ""):
                return cat if cat in names else None
        return None


def test_ai_categorize_endpoint(client: TestClient):
    cat = client.post("/api/categories", json={"name": "Dining"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/imports/commit",
        data={"account_id": str(acct), "mapping": json.dumps(
            {"date": "Date", "description": "Description", "amount": "Amount"})},
        files={"file": ("s.csv", io.BytesIO(CSV.encode()), "text/csv")},
    )

    # override the real Ollama client with a deterministic fake
    app.dependency_overrides[get_categorizer] = lambda: _FakeCategorizer({"MYSTERY DINER": "Dining"})
    try:
        resp = client.post("/api/categorize/ai")
        assert resp.status_code == 200
        assert resp.json()["updated"] == 1
    finally:
        app.dependency_overrides.pop(get_categorizer, None)

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["MYSTERY DINER"]["category_name"] == "Dining"
    assert by_desc["ODD SHOP"]["category_id"] is None
```

- [ ] **Step 3: Run RED** — `pytest -q tests/test_ai_categorize.py` → FAIL.

- [ ] **Step 4: Write `backend/app/api/categorize.py`:**
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.db import get_session
from app.services.llm_categorize import ai_categorize_uncategorized
from app.services.ollama import OllamaCategorizer, get_categorizer

router = APIRouter()


class AiCategorizeResult(BaseModel):
    updated: int


@router.post("/categorize/ai", response_model=AiCategorizeResult)
def categorize_ai(
    session: Session = Depends(get_session),
    categorizer: OllamaCategorizer = Depends(get_categorizer),
) -> AiCategorizeResult:
    updated = ai_categorize_uncategorized(session, categorizer)
    return AiCategorizeResult(updated=updated)
```

- [ ] **Step 5: Register router in `backend/app/main.py`** — `from app.api.categorize import router as categorize_router` + `app.include_router(categorize_router, prefix="/api")`.

- [ ] **Step 6: Run GREEN** — `pytest -q tests/test_ai_categorize.py` then full `pytest -q -W error::DeprecationWarning` → all green. Report.

- [ ] **Step 7: Commit:**
```bash
git add backend/app/services/llm_categorize.py backend/app/api/categorize.py backend/app/main.py backend/tests/test_ai_categorize.py
git commit -m "feat(api): AI-categorize endpoint over uncategorized transactions (TDD, injected categorizer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Deploy hardening (Ollama pin, nginx timeouts, model pull)

**Files:** modify `docker-compose.yml`, `frontend/nginx.conf`, `scripts/deploy.sh`. (No app tests; validate compose + nginx syntax.)

- [ ] **Step 1: Pin the Ollama image** in `docker-compose.yml` — change `image: ollama/ollama:latest` to a pinned tag. Use `ollama/ollama:0.5.7` UNLESS verification (Step 4 on the minipc) shows a different installed/available version; if unsure, the deploy step will reveal the running version — pin to whatever is confirmed working there. (Record the chosen tag in a comment.)
> The implementer should NOT guess blindly: first run `ssh minipc "docker image inspect ollama/ollama:latest --format '{{.RepoTags}} {{index .Config.Labels \"org.opencontainers.image.version\"}}'"` (or `ssh minipc "docker exec spendanalyzer-llm-1 ollama --version"`) to find the version already pulled on the minipc, and pin to that exact tag. Report the tag used.

- [ ] **Step 2: Raise nginx proxy timeouts** for slow LLM calls — in `frontend/nginx.conf`, inside the `location /api/` block, add (after `proxy_http_version 1.1;`):
```nginx
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_set_header X-Forwarded-Proto $scheme;
```

- [ ] **Step 3: Pull the model on deploy** — in `scripts/deploy.sh`, after the `docker compose ... up -d --build` line (inside the same ssh block), add an idempotent model pull:
```bash
  echo 'Ensuring the Ollama model is present (idempotent)...'
  MODEL=\$(grep -E '^OLLAMA_MODEL=' .env | tail -n1 | cut -d= -f2)
  MODEL=\${MODEL:-qwen2.5:7b-instruct}
  docker compose -f docker-compose.yml -f docker-compose.minipc.yml exec -T llm ollama pull \"\$MODEL\"
```
(`ollama pull` is a no-op if the model is already present, so this is safe to run every deploy.)

- [ ] **Step 4: Validate (Mac, no live run)** — `docker compose -f docker-compose.yml -f docker-compose.minipc.yml config >/dev/null && echo "compose OK"` and `bash -n scripts/deploy.sh && echo "deploy syntax OK"`.

- [ ] **Step 5: Commit:**
```bash
git add docker-compose.yml frontend/nginx.conf scripts/deploy.sh
git commit -m "chore(deploy): pin Ollama image, raise nginx LLM timeouts, idempotent model pull

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend "Categorize with AI" button (TDD)

**Files:** modify `frontend/src/api/categorize.ts` (new), `frontend/src/pages/Transactions.tsx`, `frontend/src/pages/Transactions.test.tsx`.

- [ ] **Step 1: Create `frontend/src/api/categorize.ts`:**
```typescript
import { api } from "./client";

export const aiCategorize = () =>
  api<{ updated: number }>("/categorize/ai", { method: "POST" });
```

- [ ] **Step 2: Extend `Transactions.test.tsx`** — add `import * as categorizeApi from "../api/categorize";` + `vi.mock("../api/categorize");`, and a test:
```typescript
test("Categorize with AI calls the endpoint and shows the count", async () => {
  vi.mocked(categorizeApi.aiCategorize).mockResolvedValue({ updated: 3 });
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.click(screen.getByRole("button", { name: /categorize with ai/i }));
  await waitFor(() => expect(vi.mocked(categorizeApi.aiCategorize)).toHaveBeenCalled());
  expect(await screen.findByText(/ai categorized 3/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run RED** — `cd frontend && npm run test -- Transactions` → FAIL.

- [ ] **Step 4: Add the button to `Transactions.tsx`** — import `aiCategorize`; add an async handler with a `busy` state (the call is slow — disable the button + show "Categorizing…" while awaiting); on success set the existing `message` to `AI categorized ${updated} transaction(s).` and `reload()`. Place the button next to "Apply rules":
```typescript
import { aiCategorize } from "../api/categorize";
// ... add state: const [aiBusy, setAiBusy] = useState(false);
// ... handler:
const onAiCategorize = async () => {
  setError(null);
  setMessage(null);
  setAiBusy(true);
  try {
    const { updated } = await aiCategorize();
    setMessage(`AI categorized ${updated} transaction(s).`);
    reload();
  } catch (e) {
    setError((e as Error).message);
  } finally {
    setAiBusy(false);
  }
};
// ... button (next to Apply rules):
<button
  className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
  onClick={onAiCategorize}
  disabled={aiBusy}
>
  {aiBusy ? "Categorizing…" : "Categorize with AI"}
</button>
```

- [ ] **Step 5: Run GREEN** — `npm run test -- Transactions` then full `npm run test && npm run typecheck && npm run build` → all pass. Report.

- [ ] **Step 6: Commit:**
```bash
git add frontend/src/api/categorize.ts frontend/src/pages/Transactions.tsx frontend/src/pages/Transactions.test.tsx
git commit -m "feat(web): 'Categorize with AI' button (local LLM) on Transactions (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verify + deploy + live LLM smoke test

- [ ] **Step 1:** Full backend `pytest -q -W error::DeprecationWarning` + frontend `npm run test && npm run typecheck && npm run build` → green.
- [ ] **Step 2:** Secrets audit + compose validate.
- [ ] **Step 3:** Merge to `main`, then `./scripts/deploy.sh`. This deploy will **pull the ~5 GB model** (first time only; minutes) and apply the nginx timeout + pinned image.
- [ ] **Step 4: Live LLM smoke test (real model, on the minipc):**
  - Confirm the model is present: `ssh minipc "docker compose -f /home/aman/spendanalyzer/docker-compose.yml -f /home/aman/spendanalyzer/docker-compose.minipc.yml exec -T llm ollama list"` → shows `qwen2.5:7b-instruct`.
  - Seed a tiny real test: create a throwaway account + category via API, import a 1-row CSV with an obvious merchant, run `POST /api/categorize/ai`, confirm `updated >= 0` and the transaction gets a sensible category. Then DELETE the throwaway account/batch so prod stays clean. (Document each curl.)
  - Confirm RAM released afterward: `ssh minipc "docker stats --no-stream spendanalyzer-llm-1 --format '{{.MemUsage}}'"` shortly after — should drop back down within the keep_alive window.
- [ ] **Step 5: Report** — Phase 3b live; AI categorization works on the real local model; RAM releases after use. Proceed to Phase 3c (PDF import).

---

## Self-Review
- **Privacy:** OllamaCategorizer talks only to the local `ollama_url`; no cloud. ✓
- **Testable without a real LLM:** client mocks `httpx.post`; endpoint overrides `get_categorizer` with a fake. ✓
- **Robustness:** bad JSON / hallucinated category / HTTP error → None (never crashes a batch). ✓
- **Only unknowns:** service targets `category_id IS NULL` rows (rules already ran on import). ✓
- **Deploy hardening (carried from earlier reviews):** Ollama image pinned, nginx LLM timeouts, idempotent model pull. ✓
- **RAM:** `keep_alive` warms the model for the batch, then it unloads (protects headroom). ✓
- **Deferred:** PDF (3c), learn-as-rule. ✓
```
