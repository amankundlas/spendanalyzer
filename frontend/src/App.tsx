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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
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
  );
}
