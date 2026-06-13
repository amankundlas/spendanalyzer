import { NavLink } from "react-router-dom";

const NAV = [
  { label: "Overview", to: "/" },
  { label: "Accounts", to: "/accounts" },
  { label: "Transactions", to: "/transactions" },
  { label: "Import", to: "/import" },
  { label: "Categories", to: "/categories" },
  { label: "Trends", to: "/trends" },
  { label: "Budgets", to: "/budgets" },
  { label: "Settings", to: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen p-4">
      <h1 className="text-lg font-bold mb-6">Spend Analyzer</h1>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm ${isActive ? "bg-slate-700 font-medium" : "hover:bg-slate-700"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
