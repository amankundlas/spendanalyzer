import { api } from "./client";

export type MatchType = "merchant_contains" | "regex";

export interface Rule {
  id: number;
  match_type: MatchType;
  pattern: string;
  category_id: number;
  priority: number;
}

export interface RuleCreate {
  match_type: MatchType;
  pattern: string;
  category_id: number;
  priority?: number;
}

export const listRules = () => api<Rule[]>("/rules");

export const createRule = (body: RuleCreate) =>
  api<Rule>("/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteRule = (id: number) =>
  api<void>(`/rules/${id}`, { method: "DELETE" });

export const applyRules = () =>
  api<{ updated: number }>("/rules/apply", { method: "POST" });
