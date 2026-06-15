import { ReactNode, useEffect, useState } from "react";
import { authLogin, authSetup, authStatus } from "../api/auth";

type Mode = "loading" | "setup" | "login" | "authed";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authStatus()
      .then((s) => setMode(s.authenticated ? "authed" : s.configured ? "login" : "setup"))
      .catch(() => setMode("login"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "setup") await authSetup(password);
      else await authLogin(password);
      setPassword("");
      setMode("authed");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (mode === "loading") return null;
  if (mode === "authed") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={submit}
        className="w-80 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-bold">Spend Analyzer</h1>
        <p className="mb-4 text-sm text-slate-500">
          {mode === "setup"
            ? "Set a password to protect your data."
            : "Enter your password to continue."}
        </p>
        <label className="block text-sm">
          Password
          <input
            aria-label="Password"
            type="password"
            autoFocus
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {mode === "setup" ? "Set password" : "Log in"}
        </button>
      </form>
    </div>
  );
}
