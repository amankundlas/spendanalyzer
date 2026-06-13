import { useEffect, useState } from "react";
import {
  Account,
  AccountType,
  archiveAccount,
  createAccount,
  listAccounts,
} from "../api/accounts";

const TYPES: AccountType[] = ["credit", "checking", "savings"];

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
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Accounts</h2>

      <form onSubmit={submit} className="mb-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          Name
          <input
            aria-label="Name"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-sm">
          Type
          <select
            aria-label="Type"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Institution
          <input
            aria-label="Institution"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add account
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th scope="col" className="py-2">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Institution</th>
            <th scope="col" className="text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-slate-100">
              <td className="py-2 font-medium">{a.name}</td>
              <td className="capitalize">{a.type}</td>
              <td>{a.institution ?? "—"}</td>
              <td className="text-right">
                <button
                  className="text-xs text-slate-500 hover:text-rose-600"
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
              <td colSpan={4} className="py-4 text-slate-400">
                No accounts yet — add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
