import Sidebar from "./components/Sidebar";
import Overview from "./pages/Overview";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <Overview />
    </div>
  );
}
