import { useState } from "react";
import { changePassword } from "../api/auth";
import PageHeader from "../components/PageHeader";
import { Button, Card } from "../components/ui";

const fieldClass =
  "mt-1.5 w-full rounded-xl bg-bg px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent/50";

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
    <main>
      <PageHeader title="Settings" />
      <Card className="max-w-md p-6">
        <form onSubmit={submit} className="space-y-4">
          <h3 className="text-[15px] font-extrabold tracking-tight text-ink">Change password</h3>
          <label className="block text-[13px] font-semibold text-ink2">
            Current password
            <input
              aria-label="Current password"
              type="password"
              className={fieldClass}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className="block text-[13px] font-semibold text-ink2">
            New password
            <input
              aria-label="New password"
              type="password"
              className={fieldClass}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </label>
          {error && <p className="text-sm font-semibold text-spend">{error}</p>}
          {message && <p className="text-sm font-semibold text-ok">{message}</p>}
          <Button type="submit">Change password</Button>
        </form>
      </Card>
    </main>
  );
}
