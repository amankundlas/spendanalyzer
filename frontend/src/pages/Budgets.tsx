import { useEffect, useState } from "react";
import {
  Budget,
  BudgetStatus,
  budgetStatus,
  listBudgets,
  upsertBudget,
} from "../api/budgets";
import { Category, listCategories } from "../api/categories";
import { formatMoney } from "../components/Money";

const BAR_COLOR: Record<BudgetStatus["status"], string> = {
  under: "bg-emerald-500",
  near: "bg-amber-500",
  over: "bg-rose-500",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Budgets() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statuses, setStatuses] = useState<BudgetStatus[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const recurringFor = (catId: number) =>
    budgets.find((b) => b.category_id === catId && b.month === "recurring");
  const statusFor = (catId: number) => statuses.find((s) => s.category_id === catId);

  const loadAll = async () => {
    try {
      const [cats, buds] = await Promise.all([listCategories(), listBudgets()]);
      setCategories(cats);
      setBudgets(buds);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const loadStatus = (m: string) => budgetStatus(m).then(setStatuses).catch(() => setStatuses([]));

  useEffect(() => {
    loadAll();
  }, []);
  useEffect(() => {
    loadStatus(month);
  }, [month]);

  const save = async (catId: number) => {
    const raw = drafts[catId] ?? "";
    const val = parseFloat(raw);
    if (Number.isNaN(val) || val < 0) {
      setError("Enter a valid budget amount.");
      return;
    }
    setError(null);
    try {
      await upsertBudget(catId, val, "recurring");
      await loadAll();
      await loadStatus(month);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Budgets</h2>
        <label className="text-sm">
          Month{" "}
          <input
            type="month"
            aria-label="Budget month"
            className="rounded border border-slate-300 px-2 py-1"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      <p className="mb-4 text-sm text-slate-500">
        Set a recurring monthly limit per category. Bars show {month} spending vs budget.
      </p>

      <div className="space-y-3">
        {categories.map((c) => {
          const rec = recurringFor(c.id);
          const st = statusFor(c.id);
          const draft = drafts[c.id] ?? (rec ? String(rec.limit) : "");
          return (
            <div key={c.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">$</span>
                  <input
                    aria-label={`Budget for ${c.name}`}
                    type="number"
                    min="0"
                    step="1"
                    className="w-28 rounded border border-slate-300 px-2 py-1"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  />
                  <button
                    aria-label={`Save ${c.name} budget`}
                    className="rounded bg-slate-900 px-3 py-1 font-medium text-white hover:bg-slate-700"
                    onClick={() => save(c.id)}
                  >
                    Save
                  </button>
                </div>
              </div>
              {st && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${BAR_COLOR[st.status]}`}
                      style={{ width: `${Math.min(100, st.pct * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-slate-500">
                      {formatMoney(st.spent)} of {formatMoney(st.limit)}
                    </span>
                    <span
                      className={
                        st.status === "over"
                          ? "font-medium text-rose-600"
                          : st.status === "near"
                            ? "font-medium text-amber-600"
                            : "text-emerald-700"
                      }
                    >
                      {st.status === "over"
                        ? `${formatMoney(-st.remaining)} over budget`
                        : `${formatMoney(st.remaining)} left`}{" "}
                      ({st.status})
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 && (
          <p className="text-slate-400">
            No categories yet — add some on the Categories page first.
          </p>
        )}
      </div>
    </main>
  );
}
