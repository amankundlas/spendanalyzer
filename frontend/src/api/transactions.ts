import { api } from "./client";

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  direction: string;
  import_batch_id: number | null;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export interface TxnFilters {
  account_id?: number;
  search?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

export const listTransactions = (filters: TxnFilters = {}) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.append(k, String(v));
  }
  const qs = params.toString();
  return api<TransactionPage>(`/transactions${qs ? `?${qs}` : ""}`);
};
