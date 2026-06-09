const NAV_ITEMS = [
  "Overview",
  "Categories",
  "Trends",
  "Budgets",
  "Transactions",
  "Accounts",
  "Import",
  "Settings",
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 min-h-screen p-4">
      <h1 className="text-lg font-bold mb-6">Spend Analyzer</h1>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <a
            key={item}
            href="#"
            className="rounded px-3 py-2 text-sm hover:bg-slate-700"
          >
            {item}
          </a>
        ))}
      </nav>
    </aside>
  );
}
