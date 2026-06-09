import { useEffect, useState } from "react";
import { getHealth } from "../api/client";

export default function Overview() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    getHealth()
      .then((res) => setStatus(res.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-4">Overview</h2>
      <div className="rounded-lg border border-slate-200 p-6">
        <p className="text-sm text-slate-500">API status</p>
        <p className="text-xl font-medium" data-testid="api-status">
          {status}
        </p>
      </div>
    </main>
  );
}
