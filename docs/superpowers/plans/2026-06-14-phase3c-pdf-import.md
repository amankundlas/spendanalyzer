# Spend Analyzer — Phase 3c: PDF Statement Import (local LLM) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Import transactions from PDF statements: `pdfplumber` extracts the text, the local Ollama model extracts structured transactions, the user **reviews** the extracted rows, then saves (with the same dedupe + rules-categorization as CSV). PDF text never leaves the minipc.

**Architecture:** `OllamaExtractor` (httpx → Ollama `/api/generate`, `format=json`) returns a list of `{date, description, amount}` from statement text; a converter turns those into `ParsedRow`s. The import-service persistence (dedupe + categorize + batch) is refactored into a shared `persist_parsed_rows`, reused by CSV and PDF. Two endpoints: `/imports/pdf/extract` (PDF → reviewed rows, no save) and `/imports/pdf/commit` (reviewed rows → saved). The Import page detects PDF, extracts, shows a review table, then saves. LLM extraction is mocked on the Mac; real verification (synthetic PDF) happens on the minipc.

**Tech Stack:** pdfplumber (new dep), httpx, FastAPI, SQLModel, React. Privacy: statement text → only the local Ollama.

**Conventions:** TDD with mocked PDF-text + injected extractor on the Mac. One commit per task. Deploy + synthetic-PDF smoke is the final task. The extraction is best-effort over arbitrary formats; the mandatory review step is the accuracy safety net.

---

## Task 1: PDF text extraction + LLM extractor (TDD)

**Files:** modify `backend/requirements.txt`; create `backend/app/services/pdf.py`, `backend/tests/test_pdf.py`; add `OllamaExtractor` + `get_extractor` to `backend/app/services/ollama.py`; create `backend/tests/test_ollama_extractor.py`.

- [ ] **Step 1: Add pdfplumber** to `backend/requirements.txt`:
```
pdfplumber==0.11.4
```

- [ ] **Step 2: Add `OllamaExtractor` to `backend/app/services/ollama.py`** (append; reuse `_TIMEOUT`):
```python
class OllamaExtractor:
    """Extract structured transactions from statement text via local Ollama."""

    def __init__(self, base_url: str, model: str, keep_alive: str | int = "60s"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.keep_alive = keep_alive

    def _prompt(self, text: str) -> str:
        return (
            "Extract every transaction from this bank/credit-card statement text.\n"
            'Respond ONLY as JSON: {"transactions": [{"date": "YYYY-MM-DD", '
            '"description": "...", "amount": <number, negative for money out>}]}.\n'
            "Use ISO dates. If none are found, return an empty list.\n\n"
            f"STATEMENT TEXT:\n{text}\n"
        )

    def extract(self, text: str) -> list[dict]:
        try:
            resp = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": self._prompt(text),
                    "format": "json",
                    "stream": False,
                    "keep_alive": self.keep_alive,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = json.loads(resp.json().get("response", ""))
            txns = data.get("transactions", [])
            return txns if isinstance(txns, list) else []
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError, TypeError):
            return []


def get_extractor() -> "OllamaExtractor":
    s = get_settings()
    return OllamaExtractor(s.ollama_url, s.ollama_model)
```

- [ ] **Step 3: Write failing test** — `backend/tests/test_ollama_extractor.py`:
```python
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
```

- [ ] **Step 4: Write `backend/app/services/pdf.py`:**
```python
import io

import pdfplumber
from dateutil import parser as dateparser

from app.money import parse_amount_to_cents
from app.schemas import ParsedRow


def extract_text(data: bytes) -> str:
    """Extract all text from a PDF's pages (joined by newlines)."""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def to_parsed_rows(raw: list[dict]) -> list[ParsedRow]:
    """Convert raw {date, description, amount} dicts into ParsedRows.

    Rows that fail to parse (bad date/amount) are skipped rather than failing
    the whole import — the user reviews the result before saving.
    """
    rows: list[ParsedRow] = []
    for item in raw:
        try:
            txn_date = dateparser.parse(str(item["date"])).date()
            cents = parse_amount_to_cents(str(item["amount"]))
            description = str(item.get("description", "")).strip()
        except (KeyError, ValueError, TypeError):
            continue
        rows.append(
            ParsedRow(
                date=txn_date,
                description=description,
                amount_cents=cents,
                direction="debit" if cents < 0 else "credit",
            )
        )
    return rows
```

- [ ] **Step 5: Write failing test** — `backend/tests/test_pdf.py`:
```python
from app.services.pdf import to_parsed_rows


def test_to_parsed_rows_converts_and_sets_direction():
    rows = to_parsed_rows([
        {"date": "2026-01-02", "description": "WHOLE FOODS", "amount": -45.99},
        {"date": "2026-01-03", "description": "PAYROLL", "amount": 1500},
    ])
    assert len(rows) == 2
    assert rows[0].amount_cents == -4599 and rows[0].direction == "debit"
    assert rows[1].amount_cents == 150000 and rows[1].direction == "credit"


def test_to_parsed_rows_skips_unparseable():
    rows = to_parsed_rows([
        {"date": "NOTADATE", "description": "BAD", "amount": -1},
        {"date": "2026-01-02", "description": "OK", "amount": -2.00},
    ])
    assert len(rows) == 1
    assert rows[0].description == "OK"
```

- [ ] **Step 6: Run RED then GREEN** — `cd backend && . .venv/bin/activate && pytest -q tests/test_pdf.py tests/test_ollama_extractor.py` (RED first, then implement is already written, so confirm GREEN). Then full `pytest -q -W error::DeprecationWarning` → all green. (Note: `to_parsed_rows` + extractor are pure/mocked — no real PDF or LLM needed. `extract_text` is a thin pdfplumber wrapper, covered by the live smoke test in Task 4.) Report.

- [ ] **Step 7: Commit:**
```bash
git add backend/requirements.txt backend/app/services/pdf.py backend/app/services/ollama.py backend/tests/test_pdf.py backend/tests/test_ollama_extractor.py
git commit -m "feat(api): PDF text extraction + local-LLM transaction extractor (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared persistence refactor + PDF import API (TDD)

**Files:** modify `backend/app/services/imports.py`; modify `backend/app/api/imports.py`; create `backend/tests/test_pdf_import_api.py`.

- [ ] **Step 1: Refactor `imports.py`** — extract a shared `persist_parsed_rows`, and have `commit_import` call it. Replace the body of `commit_import` and add the new function:
```python
def persist_parsed_rows(
    session: Session,
    account_id: int,
    filename: str,
    source: str,
    parsed: list,
) -> ImportResult:
    """Persist already-parsed rows with dedupe + rules-categorization + a batch.

    Shared by CSV (`commit_import`) and PDF import. `parsed` is a list of
    objects with .date/.description/.amount_cents/.direction (ParsedRow).
    """
    from app.models import CategoryRule
    from app.services.categorize import match_category

    rules = list(session.exec(select(CategoryRule)))
    existing = _existing_hashes(session, account_id)

    batch = ImportBatch(account_id=account_id, source=source, filename=filename)
    session.add(batch)
    session.flush()
    batch_id = batch.id

    added = 0
    duplicate = 0
    seen: set[str] = set()
    for row in parsed:
        normalized = normalize_description(row.description)
        h = dedupe_hash(account_id, row.date, row.amount_cents, normalized)
        if h in existing or h in seen:
            duplicate += 1
            continue
        seen.add(h)
        session.add(
            Transaction(
                account_id=account_id,
                date=row.date,
                description=row.description,
                merchant=normalized,
                amount_cents=row.amount_cents,
                direction=row.direction,
                source=source,
                import_batch_id=batch_id,
                dedupe_hash=h,
                category_id=match_category(rules, normalized, row.description),
            )
        )
        added += 1

    batch.added_count = added
    batch.duplicate_count = duplicate
    session.add(batch)
    session.commit()
    return ImportResult(batch_id=batch_id, added_count=added, duplicate_count=duplicate)


def commit_import(
    session: Session, account_id: int, filename: str, text: str, mapping: ColumnMapping
) -> ImportResult:
    parsed = parse_rows(text, mapping)
    return persist_parsed_rows(session, account_id, filename, "csv", parsed)
```
(Keep `_existing_hashes`, `preview_import`, `delete_batch` unchanged. Existing CSV tests must still pass — behavior is identical.)

- [ ] **Step 2: Add PDF endpoints to `backend/app/api/imports.py`.** Add imports at top:
```python
from app.schemas import ParsedRow
from app.services.imports import persist_parsed_rows
from app.services.ollama import OllamaExtractor, get_extractor
from app.services.pdf import extract_text, to_parsed_rows
```
Add a response model + two endpoints:
```python
class PdfExtractResult(BaseModel):
    rows: list[ParsedRow]


@router.post("/imports/pdf/extract", response_model=PdfExtractResult)
async def pdf_extract(
    file: UploadFile = File(...),
    extractor: OllamaExtractor = Depends(get_extractor),
) -> PdfExtractResult:
    raw = await file.read()
    try:
        text = extract_text(raw)
    except Exception as exc:  # malformed PDF
        raise HTTPException(status_code=400, detail="could not read PDF") from exc
    rows = to_parsed_rows(extractor.extract(text))
    return PdfExtractResult(rows=rows)


class PdfCommitBody(BaseModel):
    account_id: int
    filename: str = "statement.pdf"
    rows: list[ParsedRow]


@router.post("/imports/pdf/commit", status_code=status.HTTP_201_CREATED)
def pdf_commit(body: PdfCommitBody, session: Session = Depends(get_session)):
    _require_account(session, body.account_id)
    return persist_parsed_rows(session, body.account_id, body.filename, "pdf", body.rows)
```
(`BaseModel` is already imported in imports.py; `_require_account`, `status`, `Depends`, `UploadFile`, `File`, `HTTPException` already imported.)

- [ ] **Step 3: Write failing test** — `backend/tests/test_pdf_import_api.py`:
```python
import io

from fastapi.testclient import TestClient

import app.api.imports as imports_api
from app.main import app
from app.services.ollama import get_extractor


class _FakeExtractor:
    def extract(self, text):
        return [
            {"date": "2026-01-02", "description": "WHOLEFDS MARKET", "amount": -45.99},
            {"date": "2026-01-03", "description": "PAYROLL", "amount": 1500},
        ]


def test_pdf_extract_then_commit(client: TestClient, monkeypatch):
    cat = client.post("/api/categories", json={"name": "Groceries"}).json()["id"]
    acct = client.post("/api/accounts", json={"name": "Card", "type": "credit"}).json()["id"]
    client.post(
        "/api/rules",
        json={"match_type": "merchant_contains", "pattern": "WHOLEFDS", "category_id": cat},
    )

    # avoid needing a real PDF: stub the text extraction, inject a fake LLM extractor
    monkeypatch.setattr(imports_api, "extract_text", lambda data: "irrelevant text")
    app.dependency_overrides[get_extractor] = lambda: _FakeExtractor()
    try:
        ext = client.post(
            "/api/imports/pdf/extract",
            files={"file": ("s.pdf", io.BytesIO(b"%PDF-fake"), "application/pdf")},
        )
        assert ext.status_code == 200
        rows = ext.json()["rows"]
        assert len(rows) == 2

        commit = client.post(
            "/api/imports/pdf/commit",
            json={"account_id": acct, "filename": "s.pdf", "rows": rows},
        )
        assert commit.status_code == 201
        assert commit.json()["added_count"] == 2
    finally:
        app.dependency_overrides.pop(get_extractor, None)

    items = client.get(f"/api/transactions?account_id={acct}").json()["items"]
    by_desc = {t["description"]: t for t in items}
    assert by_desc["WHOLEFDS MARKET"]["category_name"] == "Groceries"  # rule applied
    assert by_desc["WHOLEFDS MARKET"]["amount"] == -45.99
```

- [ ] **Step 4: Run RED then GREEN** — `pytest -q tests/test_pdf_import_api.py` (RED → implement → GREEN). Then full `pytest -q -W error::DeprecationWarning` → all green (existing CSV import/categorize tests must still pass after the refactor). Report.

- [ ] **Step 5: Commit:**
```bash
git add backend/app/services/imports.py backend/app/api/imports.py backend/tests/test_pdf_import_api.py
git commit -m "feat(api): PDF import (extract -> review -> commit), shared persistence refactor (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend PDF flow in the Import page (TDD)

**Files:** modify `frontend/src/api/imports.ts`; modify `frontend/src/pages/Import.tsx`, `frontend/src/pages/Import.test.tsx`.

- [ ] **Step 1: Add PDF client calls to `frontend/src/api/imports.ts`** (append):
```typescript
export const pdfExtract = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<{ rows: ParsedRow[] }>("/imports/pdf/extract", { method: "POST", body: fd });
};

export const pdfCommit = (accountId: number, filename: string, rows: ParsedRow[]) =>
  api<ImportResult>("/imports/pdf/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: accountId, filename, rows }),
  });
```

- [ ] **Step 2: Extend `Import.tsx`** — when the selected file is a PDF (name ends `.pdf` or type `application/pdf`), use the PDF flow instead of CSV analyze/mapping:
  - On PDF select: set a `pdfBusy` state, call `pdfExtract(file)`, store `pdfRows` (the returned rows) and the filename; show a review section (a table of date/description/amount with a note "Extracted by local AI — review before saving") and a **Save import** button that calls `pdfCommit(accountId, filename, pdfRows)`, then resets + refreshes batches + sets the success message.
  - Keep the existing CSV flow for non-PDF files. Detection: `const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";`
  - Accept PDFs in the file input: change `accept=".csv,text/csv"` to `accept=".csv,.pdf,text/csv,application/pdf"`.
  - Show a "Extracting from PDF with local AI… (this can take a moment)" indicator while `pdfBusy`.

- [ ] **Step 3: Add a test** to `frontend/src/pages/Import.test.tsx` — mock `pdfExtract`/`pdfCommit`, upload a `.pdf` File, assert the review rows render and Save calls `pdfCommit`. Example:
```typescript
test("PDF upload extracts, reviews, and saves", async () => {
  vi.mocked(importsApi.pdfExtract).mockResolvedValue({
    rows: [{ date: "2026-01-02", description: "WHOLE FOODS", amount_cents: -4599, direction: "debit" }],
  });
  vi.mocked(importsApi.pdfCommit).mockResolvedValue({ batch_id: 8, added_count: 1, duplicate_count: 0 });
  render(<Import />);
  await screen.findByText("Amex Gold");
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "stmt.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText(/csv file|statement file/i), pdf);
  await waitFor(() => expect(vi.mocked(importsApi.pdfExtract)).toHaveBeenCalled());
  expect(await screen.findByText("WHOLE FOODS")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /save import/i }));
  await waitFor(() => expect(vi.mocked(importsApi.pdfCommit)).toHaveBeenCalled());
});
```
> The implementer must ensure the existing CSV tests still pass; the file `<input>`'s label may need to read "CSV or PDF file" — update the existing label and any test querying it accordingly (keep the label matchable by the existing `/csv file/i` query, e.g. "CSV or PDF file").

- [ ] **Step 4: Run RED → GREEN** — `cd frontend && npm run test -- Import` then full `npm run test && npm run typecheck && npm run build` → all green. Report.

- [ ] **Step 5: Commit:**
```bash
git add frontend/src/api/imports.ts frontend/src/pages/Import.tsx frontend/src/pages/Import.test.tsx
git commit -m "feat(web): PDF statement import (extract -> review -> save) in Import page (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verify + deploy + synthetic-PDF live smoke test

- [ ] **Step 1:** Full backend `pytest -q -W error::DeprecationWarning` + frontend `npm run test && npm run typecheck && npm run build` → green.
- [ ] **Step 2:** Secrets audit + compose validate.
- [ ] **Step 3:** Merge to `main`, then `./scripts/deploy.sh` (api image rebuilds to include pdfplumber).
- [ ] **Step 4: Synthetic-PDF live smoke (real local LLM, on the minipc):**
  - Generate a tiny synthetic statement PDF ON THE MINIPC (so no PDF touches git). Use Python on the minipc with reportlab if present, else a minimal text-based PDF. Simplest robust approach: write a small statement-like PDF via the api container's Python is not guaranteed to have reportlab; instead create the PDF with a one-off `python3` + `reportlab` if available, OR skip-and-note: drive `/imports/pdf/extract` with a real generated PDF.
  - Confirm `POST /api/imports/pdf/extract` returns rows extracted by the local model; then `pdf/commit` saves them; verify the transaction appears with a category. Clean up (delete the batch + archive the throwaway account) so prod stays clean. Document each step.
  - If reportlab isn't available on the minipc and generating a PDF is impractical in-shell, at minimum confirm the endpoint wiring: `pdf/extract` on a trivial PDF returns HTTP 200 with a (possibly empty) rows list, and verify the model is reachable. Note clearly what was/wasn't exercised live.
- [ ] **Step 5: Report** — Phase 3c live; PDF import works (extract → review → save) on the real local model. **Phase 3 complete.** Stop at the Phase 3→4 boundary; note the user should validate with a real bank statement.

---

## Self-Review
- **Privacy:** PDF text → only local Ollama. ✓
- **Review-before-save:** extract returns rows; nothing persists until the user clicks Save (separate commit endpoint). ✓
- **Robustness:** unparseable rows skipped (not fatal); bad PDF → 400; LLM error → empty list. ✓
- **Reuse:** dedupe + rules-categorization + batch shared with CSV via `persist_parsed_rows`; existing CSV tests unaffected. ✓
- **Testable without real PDF/LLM:** `to_parsed_rows` pure; extractor mocks httpx; endpoint stubs `extract_text` + injects fake extractor. ✓
- **Deferred:** in-place editing of extracted rows (review is display + save/discard for now); learn-as-rule. ✓
```
