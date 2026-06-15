import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

/* ---------- Card ---------- */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-[18px] bg-surface shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{title}</h3>
      {meta != null && <span className="text-xs font-semibold text-muted">{meta}</span>}
    </div>
  );
}

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "subtle";
};
export function Button({ variant = "primary", className = "", ...props }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition-colors cursor-pointer disabled:opacity-50";
  const styles: Record<string, string> = {
    primary:
      "bg-accent text-white px-4 py-2.5 text-[13px] hover:bg-accent-d shadow-[0_8px_16px_-8px_var(--accent)]",
    ghost:
      "bg-surface text-ink2 px-4 py-2.5 text-[13px] shadow-card hover:text-ink",
    subtle: "bg-soft text-accent-d px-3 py-1.5 text-[12.5px] hover:brightness-[0.97]",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

/* ---------- Icon button ---------- */
export function IconButton({
  label,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      className={`grid h-[38px] w-[38px] place-items-center rounded-xl bg-surface text-ink2 shadow-card transition-colors hover:text-ink cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Select ---------- */
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-block">
      <select
        className={`appearance-none rounded-xl bg-surface text-[13px] font-semibold text-ink shadow-card pl-3.5 pr-9 py-2.5 cursor-pointer outline-none focus:ring-2 focus:ring-accent/40 ${className}`}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 h-1.5 w-1.5 -translate-y-[65%] rotate-45 border-b-2 border-r-2 border-muted" />
    </span>
  );
}

/* ---------- Text input ---------- */
export function TextInput({
  className = "",
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <span className="relative block">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
      )}
      <input
        className={`w-full rounded-xl bg-surface text-[13px] text-ink shadow-card ${
          icon ? "pl-9" : "pl-3.5"
        } pr-3.5 py-2.5 placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/40 ${className}`}
        {...props}
      />
    </span>
  );
}

/* ---------- Badge / pill ---------- */
type Tone = "up" | "down" | "flat" | "ok" | "over";
export function Badge({ tone = "flat", children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    up: "bg-soft text-accent-d",
    ok: "bg-soft text-accent-d",
    down: "bg-spend/15 text-spend",
    over: "bg-spend/15 text-spend",
    flat: "bg-track text-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------- Progress bar ---------- */
export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-track">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

/* ---------- Color dot ---------- */
export function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}
