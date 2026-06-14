# Spend Analyzer — Phase 3 Frontend: Categories, Rules & Categorized Transactions — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Make the Phase 3a categorization backend usable: a Categories & Rules management page, and category display + inline re-categorization + category filters + an "Apply rules" action on the Transactions table.

**Architecture:** React Router SPA (existing). New typed client modules `api/categories.ts`, `api/rules.ts`; `api/transactions.ts` extended (category fields, recategorize, filters). A `CategoryChip` component renders a colored badge. The `/categories` route (currently ComingSoon) becomes a real management page. Transactions gains a category column with an inline `<select>`.

**Tech Stack:** React/Vite/TS/Tailwind/Vitest (existing). Consumes the Phase 3a API: `/api/categories`, `/api/rules`, `/api/rules/apply`, `/api/transactions` (now returns `category_id`/`category_name`, accepts `category_id`/`uncategorized` filters), `PATCH /api/transactions/{id}`.

**Conventions:** Verify on Mac: `cd frontend && npm run test && npm run typecheck && npm run build`. One commit per task. Deploy is the final task. Slate Tailwind theme; category colors come from the API. Out of scope: LLM "categorize with AI" button (Phase 3b), PDF (3c).

---

## Task 1: API client modules + transactions extension

**Files:** create `src/api/categories.ts`, `src/api/rules.ts`; modify `src/api/transactions.ts`.

- [ ] **Step 1: `src/api/categories.ts`:**
```typescript
import { api } from "./client";

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  icon: string | null;
}

export interface CategoryCreate {
  name: string;
  color?: string;
  icon?: string | null;
  parent_id?: number | null;
}

export const listCategories = () => api<Category[]>("/categories");

export const createCategory = (body: CategoryCreate) =>
  api<Category>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateCategory = (id: number, body: Partial<CategoryCreate>) =>
  api<Category>(`/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteCategory = (id: number) =>
  api<void>(`/categories/${id}`, { method: "DELETE" });
```

- [ ] **Step 2: `src/api/rules.ts`:**
```typescript
import { api } from "./client";

export type MatchType = "merchant_contains" | "regex";

export interface Rule {
  id: number;
  match_type: MatchType;
  pattern: string;
  category_id: number;
  priority: number;
}

export interface RuleCreate {
  match_type: MatchType;
  pattern: string;
  category_id: number;
  priority?: number;
}

export const listRules = () => api<Rule[]>("/rules");

export const createRule = (body: RuleCreate) =>
  api<Rule>("/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteRule = (id: number) =>
  api<void>(`/rules/${id}`, { method: "DELETE" });

export const applyRules = () =>
  api<{ updated: number }>("/rules/apply", { method: "POST" });
```

- [ ] **Step 3: Extend `src/api/transactions.ts`** — add `category_id`/`category_name` to `Transaction`, `category_id`/`uncategorized` to `TxnFilters`, and a recategorize call. Replace the file with:
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
  category_id: number | null;
  category_name: string | null;
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
  category_id?: number;
  uncategorized?: boolean;
  limit?: number;
  offset?: number;
}

export const listTransactions = (filters: TxnFilters = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "" && v !== false) params.append(k, String(v));
  }
  const qs = params.toString();
  return api<TransactionPage>(`/transactions${qs ? `?${qs}` : ""}`);
};

export const recategorize = (id: number, categoryId: number | null) =>
  api<Transaction>(`/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId }),
  });
```

- [ ] **Step 4: Verify** — `cd frontend && npm run typecheck && npm run build` → pass.

- [ ] **Step 5: Commit:**
```bash
git add frontend/src/api/
git commit -m "feat(web): categories/rules API clients + transactions category extension

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: CategoryChip + Categories & Rules management page (TDD)

**Files:** create `src/components/CategoryChip.tsx`, `src/pages/Categories.tsx`, `src/pages/Categories.test.tsx`; modify `src/App.tsx` (route).

- [ ] **Step 1: `src/components/CategoryChip.tsx`:**
```typescript
export default function CategoryChip({
  name,
  color,
}: {
  name: string | null;
  color?: string | null;
}) {
  if (!name) {
    return <span className="text-xs text-slate-400">Uncategorized</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color ?? "#64748b"}22`, color: color ?? "#475569" }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? "#64748b" }} />
      {name}
    </span>
  );
}
```

- [ ] **Step 2: Write failing test** — `src/pages/Categories.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as categoriesApi from "../api/categories";
import * as rulesApi from "../api/rules";
import Categories from "./Categories";

vi.mock("../api/categories");
vi.mock("../api/rules");

beforeEach(() => {
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 1, name: "Groceries", parent_id: null, color: "#22c55e", icon: null },
  ]);
  vi.mocked(categoriesApi.createCategory).mockResolvedValue({
    id: 2, name: "Pets", parent_id: null, color: "#000000", icon: null,
  });
  vi.mocked(categoriesApi.deleteCategory).mockResolvedValue(undefined);
  vi.mocked(rulesApi.listRules).mockResolvedValue([]);
  vi.mocked(rulesApi.createRule).mockResolvedValue({
    id: 9, match_type: "merchant_contains", pattern: "WHOLEFDS", category_id: 1, priority: 100,
  });
  vi.mocked(rulesApi.deleteRule).mockResolvedValue(undefined);
});

test("lists categories and creates one", async () => {
  render(<Categories />);
  expect(await screen.findByText("Groceries")).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("New category name"), "Pets");
  await userEvent.click(screen.getByRole("button", { name: /add category/i }));
  await waitFor(() =>
    expect(vi.mocked(categoriesApi.createCategory)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pets" }),
    ),
  );
});

test("creates a rule against a category", async () => {
  render(<Categories />);
  await screen.findByText("Groceries");

  await userEvent.type(screen.getByLabelText("Rule pattern"), "WHOLEFDS");
  await userEvent.click(screen.getByRole("button", { name: /add rule/i }));
  await waitFor(() =>
    expect(vi.mocked(rulesApi.createRule)).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: "WHOLEFDS", match_type: "merchant_contains" }),
    ),
  );
});
```

- [ ] **Step 3: Run RED** — `npm run test -- Categories` → FAIL.

- [ ] **Step 4: Write `src/pages/Categories.tsx`:**
```typescript
import { useEffect, useState } from "react";
import {
  Category,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../api/categories";
import { MatchType, Rule, createRule, deleteRule, listRules } from "../api/rules";
import CategoryChip from "../components/CategoryChip";

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);

  // category form
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#64748b");
  // rule form
  const [matchType, setMatchType] = useState<MatchType>("merchant_contains");
  const [pattern, setPattern] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<number | "">("");

  const refresh = async () => {
    try {
      const [cats, rls] = await Promise.all([listCategories(), listRules()]);
      setCategories(cats);
      setRules(rls);
      if (ruleCategoryId === "" && cats.length) setRuleCategoryId(cats[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const catName_ = (id: number) => categories.find((c) => c.id === id);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createCategory({ name: catName, color: catColor });
      setCatName("");
      setCatColor("#64748b");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (ruleCategoryId === "") return;
    try {
      await createRule({ match_type: matchType, pattern, category_id: ruleCategoryId });
      setPattern("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const recolor = async (id: number, color: string) => {
    await updateCategory(id, { color });
    refresh();
  };

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Categories &amp; Rules</h2>
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <section className="mb-10">
        <h3 className="mb-3 font-medium">Categories</h3>
        <form onSubmit={addCategory} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            Name
            <input
              aria-label="New category name"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col">
            Color
            <input
              aria-label="New category color"
              type="color"
              className="mt-1 h-8 w-12 rounded border border-slate-300"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
            Add category
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1">
              <CategoryChip name={c.name} color={c.color} />
              <input
                aria-label={`Color for ${c.name}`}
                type="color"
                className="h-5 w-5 border-0 bg-transparent p-0"
                value={c.color}
                onChange={(e) => recolor(c.id, e.target.value)}
              />
              <button
                className="text-xs text-slate-400 hover:text-rose-600"
                aria-label={`Delete category ${c.name}`}
                onClick={() => deleteCategory(c.id).then(refresh)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-medium">Rules</h3>
        <p className="mb-3 text-sm text-slate-500">
          Rules auto-assign a category to matching transactions on import. Lower priority number wins.
        </p>
        <form onSubmit={addRule} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            Match
            <select
              aria-label="Rule match type"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as MatchType)}
            >
              <option value="merchant_contains">merchant contains</option>
              <option value="regex">regex</option>
            </select>
          </label>
          <label className="flex flex-col">
            Pattern
            <input
              aria-label="Rule pattern"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col">
            Category
            <select
              aria-label="Rule category"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={ruleCategoryId}
              onChange={(e) => setRuleCategoryId(e.target.value ? Number(e.target.value) : "")}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
            Add rule
          </button>
        </form>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th scope="col" className="py-1">Match</th>
              <th scope="col">Pattern</th>
              <th scope="col">Category</th>
              <th scope="col">Priority</th>
              <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1">{r.match_type}</td>
                <td className="font-mono">{r.pattern}</td>
                <td>
                  {(() => {
                    const c = catName_(r.category_id);
                    return <CategoryChip name={c?.name ?? null} color={c?.color} />;
                  })()}
                </td>
                <td>{r.priority}</td>
                <td className="text-right">
                  <button
                    className="text-xs text-slate-400 hover:text-rose-600"
                    aria-label={`Delete rule ${r.pattern}`}
                    onClick={() => deleteRule(r.id).then(refresh)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-slate-400">No rules yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Wire the route** — in `src/App.tsx`, import `Categories` and replace the `/categories` route element `<ComingSoon title="Categories" />` with `<Categories />`. (Leave the other ComingSoon routes.)

- [ ] **Step 6: Run GREEN** — `npm run test -- Categories` then full `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 7: Commit:**
```bash
git add frontend/src/pages/Categories.tsx frontend/src/pages/Categories.test.tsx frontend/src/components/CategoryChip.tsx frontend/src/App.tsx
git commit -m "feat(web): Categories & Rules management page (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Transactions — category column, inline recategorize, filters, apply-rules (TDD)

**Files:** modify `src/pages/Transactions.tsx`, `src/pages/Transactions.test.tsx`.

- [ ] **Step 1: Extend the test** — append to `src/pages/Transactions.test.tsx` (it already mocks `../api/transactions` and `../api/accounts`; add a categories mock and recategorize). Add at top-level imports `import * as categoriesApi from "../api/categories";` and `vi.mock("../api/categories");`, and in `beforeEach` add:
```typescript
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 3, name: "Dining", parent_id: null, color: "#f97316", icon: null },
  ]);
  vi.mocked(txApi.recategorize).mockResolvedValue({
    id: 10, account_id: 1, date: "2026-01-15", description: "PAYROLL", merchant: "PAYROLL",
    amount: 1500, direction: "credit", import_batch_id: 1, category_id: 3, category_name: "Dining",
  });
```
And add a new test:
```typescript
test("recategorizes a transaction inline", async () => {
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.selectOptions(screen.getByLabelText(/category for PAYROLL/i), "3");
  await waitFor(() =>
    expect(vi.mocked(txApi.recategorize)).toHaveBeenCalledWith(10, 3),
  );
});
```
> The existing `listTransactions` mock returns a row with `category_id`/`category_name`; ensure that mock object includes `category_id: null, category_name: null` (update it if TypeScript complains about missing fields).

- [ ] **Step 2: Run RED** — `npm run test -- Transactions` → FAIL.

- [ ] **Step 3: Update `src/pages/Transactions.tsx`:**
  - Import categories + recategorize + CategoryChip:
    ```typescript
    import { Category, listCategories } from "../api/categories";
    import { Transaction, applyThenReload, listTransactions, recategorize } from "../api/transactions";
    ```
    (Keep existing imports; add `recategorize` from transactions and `listCategories`/`Category` from categories, and `import { applyRules } from "../api/rules";`, and `import CategoryChip from "../components/CategoryChip";`.)
  - Add state: `const [categories, setCategories] = useState<Category[]>([]);` and load it in the mount effect: `listCategories().then(setCategories).catch(() => undefined);`
  - Add a category lookup: `const categoryColor = (id: number | null) => categories.find((c) => c.id === id)?.color ?? null;`
  - Add `categoryId`/`uncategorized` filter state + controls (a category `<select>` "All categories" + each category, and reuse the existing filter row). Pass them into `listTransactions({ ..., category_id: catFilter, uncategorized })`. Changing them resets offset to 0 (like the other filters).
  - Add an **Apply rules** button near the filters:
    ```typescript
    <button
      className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
      onClick={async () => {
        const { updated } = await applyRules();
        setMessage(`Applied rules: ${updated} categorized.`);
        setOffset((o) => o); // trigger reload via a refresh flag
        reload();
      }}
    >
      Apply rules
    </button>
    ```
    (Implement `reload()` by extracting the transactions-fetch effect body into a callback, OR add a `refreshKey` state incremented to retrigger the effect; keep a `message` state shown in emerald.)
  - In the amount/row rendering, add a **Category** column with an inline `<select>` bound to the row's `category_id`:
    ```typescript
    <td>
      <select
        aria-label={`Category for ${t.description}`}
        className="rounded border border-slate-200 px-1 py-0.5 text-xs"
        value={t.category_id ?? ""}
        onChange={async (e) => {
          const cid = e.target.value ? Number(e.target.value) : null;
          await recategorize(t.id, cid);
          reload();
        }}
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </td>
    ```
    Add a matching `<th scope="col">Category</th>` header. (Optionally render a `CategoryChip` next to the select for color; the select is what the test drives.)

> NOTE: the implementer should refactor the existing single transactions-fetch effect to expose a `reload()` function (e.g. wrap the fetch in a `useCallback` and call it from the effect and from button/handlers, with a stale-response guard preserved). Keep the existing account/search/date filters + pagination working.

- [ ] **Step 4: Add an `applyRules` re-export is NOT needed** — import `applyRules` from `../api/rules` directly (created in Task 1). (Ignore the `applyThenReload` import in Step 3's snippet — that was illustrative; use `applyRules` from `../api/rules`.)

- [ ] **Step 5: Run GREEN** — `npm run test -- Transactions` then full `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 6: Commit:**
```bash
git add frontend/src/pages/Transactions.tsx frontend/src/pages/Transactions.test.tsx
git commit -m "feat(web): category column, inline recategorize, category filter + apply-rules (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verify + deploy

- [ ] **Step 1:** `cd frontend && npm run test && npm run typecheck && npm run build` → green.
- [ ] **Step 2:** Backend still green: `cd backend && . .venv/bin/activate && pytest -q` → pass.
- [ ] **Step 3:** Secrets audit: `git ls-files | grep -iE '\.env$|\.sqlite3$|\.csv$|\.pdf$' || echo CLEAN`.
- [ ] **Step 4:** Merge phase branch to `main`, then `./scripts/deploy.sh`.
- [ ] **Step 5: Verify live** — open `http://192.168.0.100:8090/categories` (deep link → SPA loads the page); `ssh minipc "curl -fs http://localhost:8090/api/categories | python3 -c 'import sys,json;print(len(json.load(sys.stdin)),\"categories\")'"` → 12. Browser: create a rule, import a CSV (or recategorize), confirm chips render.
- [ ] **Step 6: Report** — Phase 3 categorization is now usable end-to-end (rules-based). Proceed to Phase 3b (local-LLM categorization of unknowns).

---

## Self-Review
- Categories CRUD UI (create/recolor/delete) + Rules CRUD UI (create/delete, priority shown), wired to `/categories`. ✓
- Transactions: category chip + inline `<select>` recategorize (PATCH), category + uncategorized filters, Apply-rules button. ✓
- Money/category colors from API; CategoryChip shared. ✓
- Each page has a Vitest behavioral test (create category, create rule, inline recategorize). ✓
- Deferred: LLM categorize button (3b), PDF (3c). ✓
```
