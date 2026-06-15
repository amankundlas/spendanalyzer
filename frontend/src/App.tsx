import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ThemeToggle from "./components/ThemeToggle";
import Accounts from "./pages/Accounts";
import Budgets from "./pages/Budgets";
import Categories from "./pages/Categories";
import Import from "./pages/Import";
import Overview from "./pages/Overview";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import Trends from "./pages/Trends";

export default function App() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile top bar (hidden on lg, where the sidebar is always visible) */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-ink2 shadow-card cursor-pointer"
            onClick={() => setNavOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-[15px] font-extrabold text-white">
            S
          </span>
          <ThemeToggle />
        </header>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-7 lg:py-7">
          <div className="mx-auto w-full max-w-[1240px]">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/import" element={<Import />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/trends" element={<Trends />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}
