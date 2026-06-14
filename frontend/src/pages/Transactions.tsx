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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // include archived so historical transactions still resolve to a name
    listAccounts(true)
      .then(setAccounts)
      .catch((e) => setError((e as Error).message));
  }, []);

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: number) => m.get(id) ?? `#${id}`;
  }, [accounts]);

  useEffect(() => {
    let active = true; // ignore a stale response if filters change before it resolves
    setLoading(true);
    setError(null);
    listTransactions({
      account_id: accountId,
      search: search || undefined,
      start: start || undefined,
      end: end || undefined,
      limit: PAGE,
      offset,
    })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((e) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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
          aria-label="Search description"
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

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      <p className="mb-2 text-sm text-slate-500">
        {loading ? "Loading…" : `${total} transactions`}
      </p>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th scope="col" className="py-2">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Account</th>
            <th scope="col" className="text-right">Amount</th>
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
          {!loading && items.length === 0 && (
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
