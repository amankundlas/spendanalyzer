import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Account, listAccounts } from "../api/accounts";
import { Dashboard, getDashboard } from "../api/dashboard";
import { formatMoney } from "../components/Money";

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
    <main className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Trends</h2>
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

      <section className="mb-8 rounded-lg border border-slate-200 p-5">
        <h3 className="mb-4 font-medium">Monthly spend &amp; income</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={months}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend />
              <Area type="monotone" dataKey="spend" stroke="#f43f5e" fill="#fecdd3" name="Spend" />
              <Area type="monotone" dataKey="income" stroke="#10b981" fill="#a7f3d0" name="Income" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th scope="col" className="py-2">Month</th>
            <th scope="col" className="text-right">Spend</th>
            <th scope="col" className="text-right">Income</th>
            <th scope="col" className="text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-b border-slate-100">
              <td className="py-2">{m.month}</td>
              <td className="text-right tabular-nums">{formatMoney(m.spend)}</td>
              <td className="text-right tabular-nums">{formatMoney(m.income)}</td>
              <td className="text-right tabular-nums">{formatMoney(m.income - m.spend)}</td>
            </tr>
          ))}
          {months.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-slate-400">
                No data yet — import statements to see monthly trends.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
