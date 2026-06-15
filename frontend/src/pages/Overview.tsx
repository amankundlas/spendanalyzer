import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
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

const FALLBACK = "#94a3b8";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function Overview() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(true).then(setAccounts).catch(() => undefined);
  }, []);

  useEffect(() => {
    getDashboard({ account_id: accountId })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [accountId]);

  const pieData = useMemo(
    () =>
      (data?.by_category ?? []).map((c) => ({
        name: c.category_name,
        value: c.spend,
        color: c.color ?? FALLBACK,
      })),
    [data],
  );

  return (
    <main className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <select
          aria-label="Account filter"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Spend" value={formatMoney(data?.totals.spend ?? 0)} />
        <Kpi label="Income" value={formatMoney(data?.totals.income ?? 0)} />
        <Kpi label="Net" value={formatMoney(data?.totals.net ?? 0)} />
        <Kpi label="Transactions" value={String(data?.totals.count ?? 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 p-5">
          <h3 className="mb-4 font-medium">Spending by category</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {(data?.by_category ?? []).map((c) => (
              <li key={`${c.category_id}-${c.category_name}`} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.color ?? FALLBACK }}
                  />
                  {c.category_name}
                </span>
                <span className="tabular-nums">{formatMoney(c.spend)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 p-5">
          <h3 className="mb-4 font-medium">Monthly spend vs income</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data?.by_month ?? []}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="spend" fill="#f43f5e" name="Spend" />
                <Bar dataKey="income" fill="#10b981" name="Income" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </main>
  );
}
