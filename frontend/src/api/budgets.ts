import { api } from "./client";

export interface Budget {
  id: number;
  category_id: number;
  month: string;
  limit: number;
}

export interface BudgetStatus {
  category_id: number;
  category_name: string;
  color: string | null;
  month: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  status: "under" | "near" | "over";
}

export const listBudgets = () => api<Budget[]>("/budgets");

export const upsertBudget = (category_id: number, limit: number, month = "recurring") =>
  api<Budget>("/budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id, month, limit }),
  });

export const deleteBudget = (id: number) =>
  api<void>(`/budgets/${id}`, { method: "DELETE" });

export const budgetStatus = (month: string) =>
  api<BudgetStatus[]>(`/budgets/status?month=${month}`);
