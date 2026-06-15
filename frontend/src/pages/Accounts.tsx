import { useEffect, useState } from "react";
import {
  Account,
  AccountType,
  archiveAccount,
  createAccount,
  listAccounts,
} from "../api/accounts";
import PageHeader from "../components/PageHeader";
import { Badge, Button, Card, EmptyState, Select } from "../components/ui";

const TYPES: AccountType[] = ["credit", "checking", "savings"];
const fieldClass =
  "mt-1.5 rounded-xl bg-bg px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent/50";

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("credit");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () =>
    listAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

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
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const archive = async (id: number) => {
    setError(null);
    try {
      await archiveAccount(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main>
      <PageHeader title="Accounts" subtitle="Track each card or bank account you import." />

      <Card className="mb-5 p-5">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Name
            <input
              aria-label="Name"
              className={`${fieldClass} w-44`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Type
            <Select
              aria-label="Type"
              className="mt-1.5 capitalize"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Institution
            <input
              aria-label="Institution"
              className={`${fieldClass} w-44`}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </label>
          <Button type="submit">Add account</Button>
        </form>
      </Card>

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-3">Name</th>
              <th scope="col" className="px-3 py-3">Type</th>
              <th scope="col" className="px-3 py-3">Institution</th>
              <th scope="col" className="px-5 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-line/70 last:border-0 hover:bg-bg/60">
                <td className="px-5 py-3 font-bold text-ink">{a.name}</td>
                <td className="px-3 py-3"><Badge tone="flat">{a.type}</Badge></td>
                <td className="px-3 py-3 text-ink2">{a.institution ?? "—"}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    className="text-xs font-bold text-muted transition-colors hover:text-spend cursor-pointer"
                    aria-label={`Archive ${a.name}`}
                    onClick={() => archive(a.id)}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
            {!loading && accounts.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState>No accounts yet — add one above.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
