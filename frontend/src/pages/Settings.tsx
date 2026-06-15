import { useState } from "react";
import { changePassword } from "../api/auth";

export default function Settings() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await changePassword(current, next);
      setMessage("Password changed.");
      setCurrent("");
      setNext("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>
      <form onSubmit={submit} className="max-w-sm space-y-3">
        <h3 className="font-medium">Change password</h3>
        <label className="block text-sm">
          Current password
          <input
            aria-label="Current password"
            type="password"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          New password
          <input
            aria-label="New password"
            type="password"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Change password
        </button>
      </form>
    </main>
  );
}
