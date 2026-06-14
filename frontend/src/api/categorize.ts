import { api } from "./client";

export const aiCategorize = () =>
  api<{ updated: number }>("/categorize/ai", { method: "POST" });
