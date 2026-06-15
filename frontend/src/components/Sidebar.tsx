import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { authLogout } from "../api/auth";
import ThemeToggle from "./ThemeToggle";

const I = (p: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {p}
  </svg>
);

const NAV = [
  { label: "Overview", to: "/", icon: I(<><rect x="3" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" /></>) },
  { label: "Accounts", to: "/accounts", icon: I(<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /></>) },
  { label: "Transactions", to: "/transactions", icon: I(<path d="M4 7h16M4 12h16M4 17h10" />) },
  { label: "Categories", to: "/categories", icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18" /></>) },
  { label: "Trends", to: "/trends", icon: I(<path d="M3 12h4l3-8 4 16 3-8h4" />) },
  { label: "Budgets", to: "/budgets", icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  { label: "Import", to: "/import", icon: I(<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />) },
  { label: "Settings", to: "/settings", icon: I(<><circle cx="12" cy="12" r="3" /><path d="M19.1 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.9 2.8 1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2 2 2 0 1 1-2.8-2.9 1.7 1.7 0 0 0-1.2-2.9 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9 2 2 0 1 1 2.8-2.8 1.7 1.7 0 0 0 2.9-1.2 2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2 2 2 0 1 1 2.8 2.8 1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1Z" /></>) },
];

export default function Sidebar() {
  return (
    <aside className="flex w-[230px] shrink-0 flex-col p-[14px] pt-[22px]">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-[10px] bg-accent text-[16px] font-extrabold text-white">
          S
        </span>
        <span className="text-[19px] font-extrabold tracking-tight text-ink">Spend Analyzer</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-surface text-accent-d shadow-card [&_svg]:text-accent"
                  : "text-ink2 [&_svg]:text-muted hover:text-ink"
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between pt-4">
        <button
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink cursor-pointer"
          onClick={async () => {
            await authLogout();
            window.location.reload();
          }}
        >
          {I(<><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>)}
          Log out
        </button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
