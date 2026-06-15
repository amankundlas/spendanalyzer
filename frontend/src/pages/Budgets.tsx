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
import PageHeader from "../components/PageHeader";
import { Card, Dot, EmptyState, ProgressBar, TextInput } from "../components/ui";

const BAR_COLOR: Record<BudgetStatus["status"], string> = {
  under: "var(--ok)",
  near: "#f59e0b",
  over: "var(--spend)",
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
    <main>
      <PageHeader
        title="Budgets"
        subtitle={`Set a recurring monthly limit per category. Bars show ${month} spending vs budget.`}
        right={
          <label className="flex items-center gap-2 text-[13px] font-semibold text-ink2">
            Month
            <TextInput
              type="month"
              aria-label="Budget month"
              className="w-[150px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        }
      />

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((c) => {
          const rec = recurringFor(c.id);
          const st = statusFor(c.id);
          const draft = drafts[c.id] ?? (rec ? String(rec.limit) : "");
          return (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Dot color={c.color} size={10} />
                  {c.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted">$</span>
                  <input
                    aria-label={`Budget for ${c.name}`}
                    type="number"
                    min="0"
                    step="1"
                    className="w-24 rounded-xl bg-bg px-3 py-2 text-sm font-semibold text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent/50 tabnum"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  />
                  <button
                    aria-label={`Save ${c.name} budget`}
                    className="rounded-xl bg-accent px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-accent-d cursor-pointer"
                    onClick={() => save(c.id)}
                  >
                    Save
                  </button>
                </div>
              </div>
              {st && (
                <div className="mt-3.5">
                  <ProgressBar pct={st.pct * 100} color={BAR_COLOR[st.status]} />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="font-semibold text-muted tabnum">
                      {formatMoney(st.spent)} of {formatMoney(st.limit)}
                    </span>
                    <span
                      className={
                        st.status === "over"
                          ? "font-bold text-spend"
                          : st.status === "near"
                            ? "font-bold text-amber-500"
                            : "font-bold text-ok"
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
            </Card>
          );
        })}
        {categories.length === 0 && (
          <Card className="md:col-span-2">
            <EmptyState>No categories yet — add some on the Categories page first.</EmptyState>
          </Card>
        )}
      </div>
    </main>
  );
}
