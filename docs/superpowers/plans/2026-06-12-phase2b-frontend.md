# Spend Analyzer — Phase 2b: Frontend (Accounts / Import / Transactions) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the React SPA views that consume the Phase 2a API: client-side routing, an Accounts manager, a guided CSV Import flow (upload → confirm mapping → preview → save, plus delete-by-batch), and a filterable Transactions table.

**Architecture:** React 18 + Vite + TypeScript + Tailwind v4 (from Phase 1) + react-router-dom. A typed `api<T>()` fetch helper underpins per-domain client modules (accounts/imports/transactions). Pages fetch on mount and re-fetch after mutations (plain React state — no global store). Sidebar uses `NavLink` for routing. Tests: Vitest + Testing Library with mocked API modules.

**Tech Stack:** react-router-dom ^6, existing React/Vite/TS/Tailwind/Vitest toolchain.

**Conventions:**
- Verify on the Mac: `cd frontend && npm run test && npm run typecheck && npm run build`. The live app runs only on the minipc.
- Money: the API already returns `amount` in dollars (a number) for display; format with `toLocaleString`/`Intl.NumberFormat`. Never re-derive cents in the UI.
- Styling stays consistent with Phase 1's slate Tailwind theme. Vibrant charts come in Phase 4 — keep these views clean and functional, not flashy.
- One commit per task. Do NOT push (deploy is the final task).
- Deferred (NOT in 2b): charts, categories, budgets, auth, manual transaction entry/edit. The 4 not-yet sidebar links route to a shared "Coming soon" placeholder.

---

## File Structure

```
frontend/src/
  main.tsx                 # wrap App in <BrowserRouter>
  App.tsx                  # layout: <Sidebar/> + <Routes>
  components/
    Sidebar.tsx            # NavLink nav -> routes
    Money.tsx              # formats a dollar number
  pages/
    Overview.tsx           # existing health card (kept)
    Accounts.tsx           # list + create + archive
    Transactions.tsx       # filterable, paginated table
    Import.tsx             # upload -> mapping -> preview -> save + recent imports
    ComingSoon.tsx         # placeholder for deferred sections
  api/
    client.ts              # api<T>() helper + getHealth (refactor of existing)
    accounts.ts            # Account types + calls
    imports.ts             # import types + calls
    transactions.ts        # transaction types + calls
  App.test.tsx             # updated to wrap in MemoryRouter
  pages/Accounts.test.tsx
  pages/Transactions.test.tsx
  pages/Import.test.tsx
```

---

## Task 1: Router, layout refactor, base API client

**Files:** modify `frontend/package.json`, `src/main.tsx`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/api/client.ts`, `src/App.test.tsx`; create `src/pages/ComingSoon.tsx`.

- [ ] **Step 1: Add react-router-dom** — in `frontend/package.json` add to `dependencies`: `"react-router-dom": "^6.28.0"`. Then `cd frontend && npm install`.

- [ ] **Step 2: Refactor `src/api/client.ts`** to a generic helper (keeps `getHealth`):
```typescript
const BASE = "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
}

export const getHealth = () => api<HealthResponse>("/health");
```

- [ ] **Step 3: Update `src/main.tsx`** to wrap in a router:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 4: Write `src/pages/ComingSoon.tsx`**:
```typescript
export default function ComingSoon({ title }: { title: string }) {
  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <p className="text-slate-500">This section is coming in a later phase.</p>
    </main>
  );
}
```

- [ ] **Step 5: Rewrite `src/App.tsx`** with routes:
```typescript
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Accounts from "./pages/Accounts";
import ComingSoon from "./pages/ComingSoon";
import Import from "./pages/Import";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/import" element={<Import />} />
        <Route path="/categories" element={<ComingSoon title="Categories" />} />
        <Route path="/trends" element={<ComingSoon title="Trends" />} />
        <Route path="/budgets" element={<ComingSoon title="Budgets" />} />
        <Route path="/settings" element={<ComingSoon title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```
> NOTE: `Accounts`, `Transactions`, `Import` are created in later tasks. To keep Task 1 building, create minimal placeholder versions of each now (`src/pages/Accounts.tsx`, `Transactions.tsx`, `Import.tsx`), each exactly:
> ```typescript
> export default function Placeholder() {
>   return <main className="flex-1 p-8">Loading…</main>;
> }
> ```
> Later tasks REPLACE each with the real page.

- [ ] **Step 6: Rewrite `src/components/Sidebar.tsx`** with NavLink:
```typescript
import { NavLink } from "react-router-dom";

const NAV = [
  { label: "Overview", to: "/" },
  { label: "Accounts", to: "/accounts" },
  { label: "Transactions", to: "/transactions" },
  { label: "Import", to: "/import" },
  { label: "Categories", to: "/categories" },
  { label: "Trends", to: "/trends" },
  { label: "Budgets", to: "/budgets" },
  { label: "Settings", to: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen p-4">
      <h1 className="text-lg font-bold mb-6">Spend Analyzer</h1>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm ${isActive ? "bg-slate-700 font-medium" : "hover:bg-slate-700"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 7: Update `src/App.test.tsx`** to wrap in a router (App now uses Routes):
```typescript
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "ok" }),
      }),
    ),
  );
});

test("renders sidebar and the Overview health status on the home route", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Spend Analyzer")).toBeInTheDocument();
  expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
  expect(await screen.findByText("ok")).toBeInTheDocument();
});
```

- [ ] **Step 8: Verify** — `cd frontend && npm run test && npm run typecheck && npm run build`. All pass; `dist/` produced.

- [ ] **Step 9: Commit**:
```bash
git add frontend/
git commit -m "feat(web): react-router layout, NavLink sidebar, generic api client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Typed API client modules

**Files:** create `src/api/accounts.ts`, `src/api/imports.ts`, `src/api/transactions.ts`.

- [ ] **Step 1: `src/api/accounts.ts`**:
```typescript
import { api } from "./client";

export type AccountType = "credit" | "checking" | "savings";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  archived: boolean;
}

export interface AccountCreate {
  name: string;
  type: AccountType;
  institution?: string | null;
  currency?: string;
}

export const listAccounts = (includeArchived = false) =>
  api<Account[]>(`/accounts?include_archived=${includeArchived}`);

export const createAccount = (body: AccountCreate) =>
  api<Account>("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const archiveAccount = (id: number) =>
  api<void>(`/accounts/${id}`, { method: "DELETE" });
```

- [ ] **Step 2: `src/api/imports.ts`**:
```typescript
import { api } from "./client";

export interface ColumnMapping {
  date: string;
  description: string;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  date_format?: string | null;
  debit_positive?: boolean;
}

export interface DetectedColumns {
  headers: string[];
  sample_rows: Record<string, string>[];
  suggested: ColumnMapping;
}

export interface ParsedRow {
  date: string;
  description: string;
  amount_cents: number;
  direction: string;
}

export interface ImportPreview {
  rows: ParsedRow[];
  added_count: number;
  duplicate_count: number;
}

export interface ImportResult {
  batch_id: number;
  added_count: number;
  duplicate_count: number;
}

export interface ImportBatch {
  id: number;
  account_id: number;
  source: string;
  filename: string;
  imported_at: string;
  added_count: number;
  duplicate_count: number;
}

function importForm(accountId: number, mapping: ColumnMapping, file: File): FormData {
  const fd = new FormData();
  fd.append("account_id", String(accountId));
  fd.append("mapping", JSON.stringify(mapping));
  fd.append("file", file);
  return fd;
}

export const analyzeCsv = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<DetectedColumns>("/imports/analyze", { method: "POST", body: fd });
};

export const previewImport = (accountId: number, mapping: ColumnMapping, file: File) =>
  api<ImportPreview>("/imports/commit?dry_run=true", {
    method: "POST",
    body: importForm(accountId, mapping, file),
  });

export const commitImport = (accountId: number, mapping: ColumnMapping, file: File) =>
  api<ImportResult>("/imports/commit", {
    method: "POST",
    body: importForm(accountId, mapping, file),
  });

export const listBatches = (accountId: number) =>
  api<ImportBatch[]>(`/imports?account_id=${accountId}`);

export const deleteBatch = (id: number) =>
  api<void>(`/imports/${id}`, { method: "DELETE" });
```

- [ ] **Step 3: `src/api/transactions.ts`**:
```typescript
import { api } from "./client";

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  direction: string;
  import_batch_id: number | null;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export interface TxnFilters {
  account_id?: number;
  search?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

export const listTransactions = (filters: TxnFilters = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.append(k, String(v));
  }
  const qs = params.toString();
  return api<TransactionPage>(`/transactions${qs ? `?${qs}` : ""}`);
};
```

- [ ] **Step 4: Typecheck** — `cd frontend && npm run typecheck` → clean (no unused-export errors since `noUnusedLocals` only flags locals, not exports). Build: `npm run build` → passes.

- [ ] **Step 5: Commit**:
```bash
git add frontend/src/api/
git commit -m "feat(web): typed API client modules (accounts, imports, transactions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Accounts page (TDD)

**Files:** create `src/components/Money.tsx`, replace `src/pages/Accounts.tsx`, create `src/pages/Accounts.test.tsx`.

- [ ] **Step 1: `src/components/Money.tsx`** (shared dollar formatter, used by Transactions too):
```typescript
const FMT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(amount: number): string {
  return FMT.format(amount);
}

export default function Money({ amount }: { amount: number }) {
  const negative = amount < 0;
  return (
    <span className={negative ? "text-rose-600" : "text-emerald-700"}>
      {formatMoney(amount)}
    </span>
  );
}
```

- [ ] **Step 2: Write failing test** — `src/pages/Accounts.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import Accounts from "./Accounts";

vi.mock("../api/accounts");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: "Amex", currency: "USD", archived: false },
  ]);
  vi.mocked(accountsApi.createAccount).mockResolvedValue({
    id: 2, name: "Checking", type: "checking", institution: null, currency: "USD", archived: false,
  });
  vi.mocked(accountsApi.archiveAccount).mockResolvedValue(undefined);
});

test("lists accounts and creates a new one", async () => {
  render(<Accounts />);
  expect(await screen.findByText("Amex Gold")).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Name"), "Checking");
  await userEvent.click(screen.getByRole("button", { name: /add account/i }));

  await waitFor(() =>
    expect(vi.mocked(accountsApi.createAccount)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Checking", type: "credit" }),
    ),
  );
});
```
> @testing-library/user-event must be installed: add `"@testing-library/user-event": "^14.5.2"` to devDependencies and `npm install` if not already present.

- [ ] **Step 3: Run RED** — `npm run test -- Accounts` → FAIL (placeholder page). Confirm.

- [ ] **Step 4: Replace `src/pages/Accounts.tsx`**:
```typescript
import { useEffect, useState } from "react";
import {
  Account,
  AccountType,
  archiveAccount,
  createAccount,
  listAccounts,
} from "../api/accounts";

const TYPES: AccountType[] = ["credit", "checking", "savings"];

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("credit");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listAccounts().then(setAccounts).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createAccount({ name, type, institution: institution || null });
      setName("");
      setInstitution("");
      setType("credit");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const archive = async (id: number) => {
    await archiveAccount(id);
    refresh();
  };

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Accounts</h2>

      <form onSubmit={submit} className="mb-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          Name
          <input
            aria-label="Name"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-sm">
          Type
          <select
            aria-label="Type"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Institution
          <input
            aria-label="Institution"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add account
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="py-2">Name</th>
            <th>Type</th>
            <th>Institution</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-slate-100">
              <td className="py-2 font-medium">{a.name}</td>
              <td className="capitalize">{a.type}</td>
              <td>{a.institution ?? "—"}</td>
              <td className="text-right">
                <button
                  className="text-xs text-slate-500 hover:text-rose-600"
                  onClick={() => archive(a.id)}
                >
                  Archive
                </button>
              </td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-slate-400">
                No accounts yet — add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 5: Run GREEN** — `npm run test -- Accounts` → PASS. Then `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 6: Commit**:
```bash
git add frontend/src/pages/Accounts.tsx frontend/src/pages/Accounts.test.tsx frontend/src/components/Money.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(web): Accounts view — list, create, archive (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Transactions page (TDD)

**Files:** replace `src/pages/Transactions.tsx`, create `src/pages/Transactions.test.tsx`.

- [ ] **Step 1: Write failing test** — `src/pages/Transactions.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as txApi from "../api/transactions";
import Transactions from "./Transactions";

vi.mock("../api/accounts");
vi.mock("../api/transactions");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: null, currency: "USD", archived: false },
  ]);
  vi.mocked(txApi.listTransactions).mockResolvedValue({
    total: 1,
    items: [
      {
        id: 10, account_id: 1, date: "2026-01-15", description: "PAYROLL",
        merchant: "PAYROLL", amount: 1500, direction: "credit", import_batch_id: 1,
      },
    ],
  });
});

test("renders transactions and applies a search filter", async () => {
  render(<Transactions />);
  expect(await screen.findByText("PAYROLL")).toBeInTheDocument();
  expect(screen.getByText("$1,500.00")).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText(/search/i), "shell");
  await waitFor(() =>
    expect(vi.mocked(txApi.listTransactions)).toHaveBeenCalledWith(
      expect.objectContaining({ search: "shell" }),
    ),
  );
});
```

- [ ] **Step 2: Run RED** — `npm run test -- Transactions` → FAIL. Confirm.

- [ ] **Step 3: Replace `src/pages/Transactions.tsx`**:
```typescript
import { useEffect, useMemo, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { Transaction, listTransactions } from "../api/transactions";
import Money from "../components/Money";

const PAGE = 100;

export default function Transactions() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => undefined);
  }, []);

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: number) => m.get(id) ?? `#${id}`;
  }, [accounts]);

  useEffect(() => {
    listTransactions({
      account_id: accountId,
      search: search || undefined,
      start: start || undefined,
      end: end || undefined,
      limit: PAGE,
      offset,
    })
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      });
  }, [accountId, search, start, end, offset]);

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Transactions</h2>

      <div className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <select
          aria-label="Account filter"
          className="rounded border border-slate-300 px-2 py-1"
          value={accountId ?? ""}
          onChange={(e) => {
            setOffset(0);
            setAccountId(e.target.value ? Number(e.target.value) : undefined);
          }}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Search description"
          className="rounded border border-slate-300 px-2 py-1"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
        />
        <input
          type="date"
          aria-label="Start date"
          className="rounded border border-slate-300 px-2 py-1"
          value={start}
          onChange={(e) => {
            setOffset(0);
            setStart(e.target.value);
          }}
        />
        <input
          type="date"
          aria-label="End date"
          className="rounded border border-slate-300 px-2 py-1"
          value={end}
          onChange={(e) => {
            setOffset(0);
            setEnd(e.target.value);
          }}
        />
      </div>

      <p className="mb-2 text-sm text-slate-500">{total} transactions</p>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="py-2">Date</th>
            <th>Description</th>
            <th>Account</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2 whitespace-nowrap">{t.date}</td>
              <td>{t.description}</td>
              <td className="text-slate-500">{accountName(t.account_id)}</td>
              <td className="text-right tabular-nums">
                <Money amount={t.amount} />
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-slate-400">
                No transactions match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {total > PAGE && (
        <div className="mt-4 flex gap-2 text-sm">
          <button
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            Previous
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run GREEN** — `npm run test -- Transactions` → PASS. Then `npm run test && npm run typecheck && npm run build`.

- [ ] **Step 5: Commit**:
```bash
git add frontend/src/pages/Transactions.tsx frontend/src/pages/Transactions.test.tsx
git commit -m "feat(web): Transactions view — filterable, paginated table (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Import page (TDD)

**Files:** replace `src/pages/Import.tsx`, create `src/pages/Import.test.tsx`.

The flow: pick account + file → `analyzeCsv` returns suggested mapping + headers → user confirms mapping (dropdowns from headers) → `previewImport` (dry run) shows added/duplicate counts + parsed rows → `commitImport` saves → recent imports list with delete.

- [ ] **Step 1: Write failing test** — `src/pages/Import.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as importsApi from "../api/imports";
import Import from "./Import";

vi.mock("../api/accounts");
vi.mock("../api/imports");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: null, currency: "USD", archived: false },
  ]);
  vi.mocked(importsApi.listBatches).mockResolvedValue([]);
  vi.mocked(importsApi.analyzeCsv).mockResolvedValue({
    headers: ["Date", "Description", "Amount"],
    sample_rows: [{ Date: "2026-01-02", Description: "WHOLE FOODS", Amount: "-45.99" }],
    suggested: { date: "Date", description: "Description", amount: "Amount" },
  });
  vi.mocked(importsApi.previewImport).mockResolvedValue({
    rows: [{ date: "2026-01-02", description: "WHOLE FOODS", amount_cents: -4599, direction: "debit" }],
    added_count: 1,
    duplicate_count: 0,
  });
  vi.mocked(importsApi.commitImport).mockResolvedValue({
    batch_id: 5, added_count: 1, duplicate_count: 0,
  });
});

function selectFile() {
  const file = new File(["Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n"], "stmt.csv", {
    type: "text/csv",
  });
  return userEvent.upload(screen.getByLabelText(/csv file/i), file);
}

test("guides upload -> analyze -> preview -> save", async () => {
  render(<Import />);
  await screen.findByText("Amex Gold"); // accounts loaded into the select

  await selectFile();
  await waitFor(() => expect(vi.mocked(importsApi.analyzeCsv)).toHaveBeenCalled());

  // preview
  await userEvent.click(await screen.findByRole("button", { name: /preview/i }));
  expect(await screen.findByText(/1 new/i)).toBeInTheDocument();

  // save
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(vi.mocked(importsApi.commitImport)).toHaveBeenCalled());
  expect(await screen.findByText(/imported 1/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED** — `npm run test -- Import` → FAIL. Confirm.

- [ ] **Step 3: Replace `src/pages/Import.tsx`**:
```typescript
import { useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import {
  ColumnMapping,
  ImportBatch,
  ImportPreview,
  analyzeCsv,
  commitImport,
  deleteBatch,
  listBatches,
  previewImport,
} from "../api/imports";

export default function Import() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts().then((a) => {
      setAccounts(a);
      if (a.length && accountId === undefined) setAccountId(a[0].id);
    });
  }, []);

  useEffect(() => {
    if (accountId !== undefined) listBatches(accountId).then(setBatches).catch(() => undefined);
  }, [accountId, message]);

  const onFile = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setMessage(null);
    setError(null);
    if (!f) return;
    try {
      const detected = await analyzeCsv(f);
      setHeaders(detected.headers);
      setMapping(detected.suggested);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doPreview = async () => {
    if (accountId === undefined || !file || !mapping) return;
    setError(null);
    try {
      setPreview(await previewImport(accountId, mapping, file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doSave = async () => {
    if (accountId === undefined || !file || !mapping) return;
    setError(null);
    try {
      const result = await commitImport(accountId, mapping, file);
      setMessage(`Imported ${result.added_count}, skipped ${result.duplicate_count} duplicate(s).`);
      setFile(null);
      setMapping(null);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeBatch = async (id: number) => {
    await deleteBatch(id);
    setMessage("Import deleted.");
  };

  const setMap = (field: keyof ColumnMapping, value: string) =>
    setMapping((m) => (m ? { ...m, [field]: value || null } : m));

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Import</h2>

      <div className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col">
          Account
          <select
            aria-label="Account"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={accountId ?? ""}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-emerald-700">{message}</p>}

      {mapping && headers.length > 0 && (
        <section className="mb-6 rounded-lg border border-slate-200 p-4">
          <h3 className="mb-3 font-medium">Confirm column mapping</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["date", "description", "amount", "debit", "credit"] as const).map((field) => (
              <label key={field} className="flex flex-col capitalize">
                {field}
                <select
                  aria-label={`${field} column`}
                  className="mt-1 rounded border border-slate-300 px-2 py-1"
                  value={(mapping[field] as string) ?? ""}
                  onChange={(e) => setMap(field, e.target.value)}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="mt-4 rounded bg-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-300"
            onClick={doPreview}
          >
            Preview
          </button>
        </section>
      )}

      {preview && (
        <section className="mb-6 rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm">
            <strong>{preview.added_count} new</strong>, {preview.duplicate_count} duplicate(s)
            will be skipped.
          </p>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-1">Date</th>
                <th>Description</th>
                <th className="text-right">Amount (cents)</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1">{r.date}</td>
                  <td>{r.description}</td>
                  <td className="text-right tabular-nums">{r.amount_cents}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            onClick={doSave}
          >
            Save import
          </button>
        </section>
      )}

      <section>
        <h3 className="mb-3 font-medium">Recent imports</h3>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-1">File</th>
              <th>Added</th>
              <th>Duplicates</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-1">{b.filename}</td>
                <td>{b.added_count}</td>
                <td>{b.duplicate_count}</td>
                <td className="text-right">
                  <button
                    className="text-xs text-slate-500 hover:text-rose-600"
                    onClick={() => removeBatch(b.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-slate-400">
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run GREEN** — `npm run test -- Import` → PASS. Then `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 5: Commit**:
```bash
git add frontend/src/pages/Import.tsx frontend/src/pages/Import.test.tsx
git commit -m "feat(web): Import view — upload, confirm mapping, preview, save, delete-batch (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification + deploy

- [ ] **Step 1: Full frontend checks** — `cd frontend && npm run test && npm run typecheck && npm run build` → all green, `dist/` built.
- [ ] **Step 2: Backend unaffected** — `cd backend && . .venv/bin/activate && pytest -q` → still green.
- [ ] **Step 3: Secrets audit** — `git ls-files | grep -iE '\.env$|\.sqlite3$|\.csv$|\.pdf$' || echo CLEAN`.
- [ ] **Step 4: Merge to main + deploy** — merge the phase branch to `main`, then `./scripts/deploy.sh` (frontend image rebuilds with the new views).
- [ ] **Step 5: Verify live** — open `http://192.168.0.100:8090`; the sidebar navigates between Overview / Accounts / Transactions / Import. Smoke-check from the shell:
  `ssh minipc "curl -fs http://localhost:8090/ | grep -o '<title>[^<]*</title>'"` → the SPA shell loads.
  (Functional click-through is manual in the browser; the API is already verified from Phase 2a.)
- [ ] **Step 6: Report** Phase 2b complete; UI live; stop at phase boundary.

---

## Self-Review (against Phase-2 decisions)

- **React Router** for sidebar nav (decision): Task 1 NavLink + Routes; deferred sections → ComingSoon. ✓
- **Always preview + confirm** import (decision): Task 5 enforces analyze → confirm mapping → preview (added/duplicate counts + rows) → Save. Nothing saves without an explicit Save click. ✓
- **Delete-by-batch** (decision): Task 5 "Recent imports" list with Delete. ✓
- **Accounts** list/create/archive: Task 3. ✓
- **Transactions** filterable (account/search/date) + paginated, money in dollars via shared formatter: Task 4. ✓
- **Money**: UI consumes the API's dollar `amount`, never re-derives cents. ✓
- **Consistency**: all views use the Phase-1 slate Tailwind theme; vibrant charts deferred to Phase 4. ✓
- **Tests**: each page has a Vitest behavior test with mocked API modules (real render + interaction, not mock-of-itself). ✓
- **Deferred (correctly absent):** charts, categories, budgets, auth, manual txn entry. ✓
```
