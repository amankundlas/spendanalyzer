import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Accounts from "./pages/Accounts";
import Budgets from "./pages/Budgets";
import Categories from "./pages/Categories";
import Import from "./pages/Import";
import Overview from "./pages/Overview";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import Trends from "./pages/Trends";

export default function App() {
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <Sidebar />
      <div className="flex-1 px-7 py-7">
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
  );
}
