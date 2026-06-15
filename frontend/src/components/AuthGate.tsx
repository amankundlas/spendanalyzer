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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--soft), transparent)" }}
      />
      <form
        onSubmit={submit}
        className="relative w-[360px] rounded-[22px] bg-surface p-7 shadow-card"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent text-[18px] font-extrabold text-white">
            S
          </span>
          <h1 className="text-[19px] font-extrabold tracking-tight text-ink">Spend Analyzer</h1>
        </div>
        <p className="mb-5 text-sm font-medium text-muted">
          {mode === "setup"
            ? "Set a password to protect your data."
            : "Enter your password to continue."}
        </p>
        <label className="block text-[13px] font-semibold text-ink2">
          Password
          <input
            aria-label="Password"
            type="password"
            autoFocus
            className="mt-1.5 w-full rounded-xl bg-bg text-sm text-ink px-3.5 py-2.5 outline-none ring-1 ring-line transition focus:ring-2 focus:ring-accent/50"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="mt-2.5 text-sm font-semibold text-spend">{error}</p>}
        <button
          type="submit"
          className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-d cursor-pointer"
        >
          {mode === "setup" ? "Set password" : "Log in"}
        </button>
      </form>
    </div>
  );
}
