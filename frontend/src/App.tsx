import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Accounts from "./pages/Accounts";
import Categories from "./pages/Categories";
import ComingSoon from "./pages/ComingSoon";
import Import from "./pages/Import";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";

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
        <Route path="/trends" element={<ComingSoon title="Trends" />} />
        <Route path="/budgets" element={<ComingSoon title="Budgets" />} />
        <Route path="/settings" element={<ComingSoon title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
