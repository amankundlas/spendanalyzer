import { useEffect, useMemo, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { Category, listCategories } from "../api/categories";
import { aiCategorizeStart, categorizeJob } from "../api/categorize";
import { applyRules } from "../api/rules";
import { Transaction, deleteTransaction, listTransactions, recategorize } from "../api/transactions";
import Money from "../components/Money";
import PageHeader from "../components/PageHeader";
import { Badge, Button, Card, EmptyState, Select, TextInput } from "../components/ui";

const PAGE = 100;

export default function Transactions() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [catFilter, setCatFilter] = useState<number | "">("");
  const [uncategorized, setUncategorized] = useState(false);
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    // include archived so historical transactions still resolve to a name
    listAccounts(true).then(setAccounts).catch((e) => setError((e as Error).message));
    listCategories().then(setCategories).catch(() => undefined);
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
      category_id: catFilter === "" ? undefined : catFilter,
      uncategorized: uncategorized || undefined,
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
  }, [accountId, search, start, end, catFilter, uncategorized, offset, reloadKey]);

  const onRecategorize = async (id: number, value: string) => {
    try {
      await recategorize(id, value ? Number(value) : null);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDelete = async (t: Transaction) => {
    if (!window.confirm(`Delete "${t.description}"? This can't be undone.`)) return;
    try {
      await deleteTransaction(t.id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onApplyRules = async () => {
    setError(null);
    setMessage(null);
    try {
      const { updated } = await applyRules();
      setMessage(`Applied rules: ${updated} transaction(s) categorized.`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onAiCategorize = async () => {
    setError(null);
    setMessage(null);
    setAiBusy(true);
    try {
      // Categorization runs in the background (many slow LLM calls). Start the
      // job, then poll — each poll is a fast request mobile browsers keep alive.
      const { job_id } = await aiCategorizeStart();
      let fails = 0;
      const poll = async () => {
        try {
          const job = await categorizeJob(job_id);
          if (job.status === "done") {
            setMessage(`AI categorized ${job.updated ?? 0} transaction(s).`);
            setAiBusy(false);
            reload();
            return;
          }
          if (job.status === "error") {
            setError(job.detail ?? "AI categorization failed.");
            setAiBusy(false);
            return;
          }
          fails = 0;
        } catch {
          if (++fails > 5) {
            setError("Lost the connection during AI categorization. Please try again.");
            setAiBusy(false);
            return;
          }
        }
        window.setTimeout(poll, 2500);
      };
      poll();
    } catch (e) {
      setError((e as Error).message);
      setAiBusy(false);
    }
  };

  return (
    <main>
      <PageHeader
        title="Transactions"
        right={
          <>
            <Button variant="ghost" onClick={onApplyRules}>
              Apply rules
            </Button>
            <Button onClick={onAiCategorize} disabled={aiBusy}>
              {aiBusy ? "Categorizing…" : "Categorize with AI"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Select
          aria-label="Account filter"
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
        </Select>
        <TextInput
          placeholder="Search description"
          aria-label="Search description"
          className="w-56"
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
          }
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
        />
        <TextInput
          type="date"
          aria-label="Start date"
          className="w-[150px]"
          value={start}
          onChange={(e) => {
            setOffset(0);
            setStart(e.target.value);
          }}
        />
        <TextInput
          type="date"
          aria-label="End date"
          className="w-[150px]"
          value={end}
          onChange={(e) => {
            setOffset(0);
            setEnd(e.target.value);
          }}
        />
        <Select
          aria-label="Category filter"
          value={catFilter}
          onChange={(e) => {
            setOffset(0);
            setCatFilter(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-ink2 shadow-card">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={uncategorized}
            onChange={(e) => {
              setOffset(0);
              setUncategorized(e.target.checked);
            }}
          />
          Uncategorized only
        </label>
      </div>

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}
      {message && <p className="mb-2 text-sm font-semibold text-ok">{message}</p>}
      <p className="mb-3 text-[13px] font-semibold text-muted">
        {loading ? "Loading…" : `${total} transactions`}
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-3">Date</th>
              <th scope="col" className="px-3 py-3">Description</th>
              <th scope="col" className="px-3 py-3">Account</th>
              <th scope="col" className="px-3 py-3">Category</th>
              <th scope="col" className="px-5 py-3 text-right">Amount</th>
              <th scope="col" className="px-3 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-line/70 last:border-0 hover:bg-bg/60">
                <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-ink2 tabnum">{t.date}</td>
                <td className="px-3 py-2.5 font-semibold text-ink">{t.description}</td>
                <td className="px-3 py-2.5 text-ink2">{accountName(t.account_id)}</td>
                <td className="px-3 py-2.5">
                  <Select
                    aria-label={`Category for ${t.description}`}
                    className="!py-1.5 !text-xs"
                    value={t.category_id ?? ""}
                    onChange={(e) => onRecategorize(t.id, e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Money amount={t.amount} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    aria-label={`Delete ${t.description}`}
                    title="Delete transaction"
                    className="text-muted transition-colors hover:text-spend cursor-pointer"
                    onClick={() => onDelete(t)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState>No transactions match these filters.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {total > PAGE && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            Previous
          </Button>
          <Badge tone="flat">
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </Badge>
          <Button
            variant="ghost"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </Button>
        </div>
      )}
    </main>
  );
}
