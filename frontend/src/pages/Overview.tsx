import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Account, listAccounts } from "../api/accounts";
import { Dashboard, getDashboard } from "../api/dashboard";
import { formatMoney } from "../components/Money";
import PageHeader from "../components/PageHeader";
import { Card, CardHeader, Dot, EmptyState, Select } from "../components/ui";
import { CHART } from "../theme";

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** First/last day of a "YYYY-MM" month, as YYYY-MM-DD. */
function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this one
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Deep link to Transactions filtered by a category (and the current account/month). */
function txnHref(categoryId: number | null, accountId?: number, month?: string): string {
  const p = new URLSearchParams();
  if (categoryId === null) p.set("uncategorized", "true");
  else p.set("category_id", String(categoryId));
  if (accountId !== undefined) p.set("account_id", String(accountId));
  if (month) {
    const { start, end } = monthRange(month);
    p.set("start", start);
    p.set("end", end);
  }
  return `/transactions?${p.toString()}`;
}

const KPI = [
  { key: "spend", label: "Spent", tint: "var(--spend)" },
  { key: "income", label: "Income", tint: "var(--ok)" },
  { key: "net", label: "Net", tint: "var(--accent)" },
  { key: "count", label: "Transactions", tint: "var(--muted)" },
] as const;

export default function Overview() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [month, setMonth] = useState(""); // "" = all time
  const [allData, setAllData] = useState<Dashboard | null>(null); // all-time: month list + cash-flow trend
  const [data, setData] = useState<Dashboard | null>(null); // scoped to the selected month
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(true).then(setAccounts).catch(() => undefined);
  }, []);

  // All-time view (for the account): drives the month picker, the cash-flow
  // trend, and defaults the page to the most recent month with data.
  useEffect(() => {
    getDashboard({ account_id: accountId })
      .then((d) => {
        setAllData(d);
        const ms = d.by_month.map((m) => m.month);
        setMonth((cur) => cur || (ms.length ? ms[ms.length - 1] : ""));
      })
      .catch(() => setAllData(null));
  }, [accountId]);

  // Everything else on the page (KPIs, category donut) reflects the chosen month.
  useEffect(() => {
    const range = month ? monthRange(month) : {};
    getDashboard({ account_id: accountId, ...range })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [accountId, month]);

  const months = allData?.by_month.map((m) => m.month) ?? [];

  const pieData = useMemo(
    () =>
      (data?.by_category ?? []).map((c) => ({
        name: c.category_name,
        category_id: c.category_id,
        value: c.spend,
        color: c.color ?? CHART.fallback,
      })),
    [data],
  );

  const kpiValue = (k: string) =>
    k === "count"
      ? String(data?.totals.count ?? 0)
      : formatMoney((data?.totals as Record<string, number> | undefined)?.[k] ?? 0);

  return (
    <main>
      <PageHeader
        greeting={
          <>
            {greet()} <span className="align-middle">👋</span>
          </>
        }
        subtitle="Here's how your money moved."
        right={
          <>
            <Select
              aria-label="Month filter"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="">All time</option>
              {[...months].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Account filter"
              value={accountId ?? ""}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI.map((k) => (
          <Card key={k.key} className="relative overflow-hidden p-5">
            <span
              className="absolute right-0 top-0 h-full w-1.5"
              style={{ background: k.tint }}
            />
            <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{k.label}</p>
            <p className="mt-2 text-[26px] font-extrabold tabnum tracking-tight text-ink">
              {kpiValue(k.key)}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <CardHeader title="Spending by category" meta={month ? monthLabel(month) : "all time"} />
          <div className="relative" style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                  style={{ cursor: "pointer" }}
                  onClick={(slice) =>
                    navigate(txnHref((slice as { category_id?: number | null }).category_id ?? null, accountId, month))
                  }
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMoney(Number(v))}
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-extrabold tabnum text-ink">{pieData.length}</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {pieData.length === 1 ? "category" : "categories"}
              </span>
            </div>
          </div>
          <ul className="mt-3 space-y-0.5">
            {(data?.by_category ?? []).map((c) => (
              <li key={`${c.category_id}-${c.category_name}`}>
                <Link
                  to={txnHref(c.category_id, accountId, month)}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1 text-[13px] transition-colors hover:bg-bg/70"
                >
                  <span className="flex items-center gap-2 font-semibold text-ink2">
                    <Dot color={c.color ?? CHART.fallback} />
                    {c.category_name}
                  </span>
                  <span className="tabnum font-bold text-ink">{formatMoney(c.spend)}</span>
                </Link>
              </li>
            ))}
            {(data?.by_category ?? []).length === 0 && (
              <EmptyState>No spending yet.</EmptyState>
            )}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <CardHeader title="Cash flow" meta="all months" />
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={allData?.by_month ?? []} margin={{ left: -18, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.income} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={CHART.income} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.spend} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHART.spend} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke={CHART.income}
                  strokeWidth={2.5}
                  fill="url(#gIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  name="Spend"
                  stroke={CHART.spend}
                  strokeWidth={2.5}
                  fill="url(#gSpend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-5 text-[12.5px] font-semibold text-ink2">
            <span className="flex items-center gap-1.5">
              <Dot color={CHART.income} /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <Dot color={CHART.spend} /> Spend
            </span>
          </div>
        </Card>
      </div>
    </main>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "var(--sh)",
} as const;

const axisTick = { fontSize: 12, fill: "var(--muted)", fontWeight: 600 } as const;
