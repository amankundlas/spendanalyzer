import { api } from "./client";

export type AccountType = "credit" | "checking" | "savings";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  archived: boolean;
}

export interface AccountCreate {
  name: string;
  type: AccountType;
  institution?: string | null;
  currency?: string;
}

export const listAccounts = (includeArchived = false) =>
  api<Account[]>(`/accounts?include_archived=${includeArchived}`);

export const createAccount = (body: AccountCreate) =>
  api<Account>("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const archiveAccount = (id: number) =>
  api<void>(`/accounts/${id}`, { method: "DELETE" });
