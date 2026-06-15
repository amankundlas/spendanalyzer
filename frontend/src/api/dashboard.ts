import { api } from "./client";

export interface DashboardTotals {
  spend: number;
  income: number;
  net: number;
  count: number;
}
export interface CategorySpend {
  category_id: number | null;
  category_name: string;
  color: string | null;
  spend: number;
}
export interface MonthPoint {
  month: string;
  spend: number;
  income: number;
}
export interface Dashboard {
  totals: DashboardTotals;
  by_category: CategorySpend[];
  by_month: MonthPoint[];
}
export interface DashboardFilters {
  account_id?: number;
  start?: string;
  end?: string;
}

export const getDashboard = (f: DashboardFilters = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") p.append(k, String(v));
  const qs = p.toString();
  return api<Dashboard>(`/dashboard${qs ? `?${qs}` : ""}`);
};
