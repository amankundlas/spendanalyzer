import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

export default function Trends() {
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

  const months = data?.by_month ?? [];

  return (
    <main>
      <PageHeader
        title="Trends"
        right={
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
        }
      />

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}

      <Card className="mb-4 p-5">
        <CardHeader
          title="Monthly spend & income"
          meta={
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <Dot color={CHART.income} /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <Dot color={CHART.spend} /> Spend
              </span>
            </span>
          }
        />
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={months} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="tIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.income} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CHART.income} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.spend} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={CHART.spend} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="spend" stroke={CHART.spend} strokeWidth={2.5} fill="url(#tSpend)" name="Spend" />
              <Area type="monotone" dataKey="income" stroke={CHART.income} strokeWidth={2.5} fill="url(#tIncome)" name="Income" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-3">Month</th>
              <th scope="col" className="px-5 py-3 text-right">Spend</th>
              <th scope="col" className="px-5 py-3 text-right">Income</th>
              <th scope="col" className="px-5 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b border-line/70 last:border-0 hover:bg-bg/60">
                <td className="px-5 py-2.5 font-semibold text-ink tabnum">{m.month}</td>
                <td className="px-5 py-2.5 text-right tabnum font-semibold text-spend">{formatMoney(m.spend)}</td>
                <td className="px-5 py-2.5 text-right tabnum font-semibold text-ok">{formatMoney(m.income)}</td>
                <td className="px-5 py-2.5 text-right tabnum font-bold text-ink">{formatMoney(m.income - m.spend)}</td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState>No data yet — import statements to see monthly trends.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
