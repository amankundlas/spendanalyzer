import { api } from "./client";

export interface CategorizeJob {
  status: "pending" | "running" | "done" | "error";
  updated: number | null;
  detail: string | null;
}

/** Start AI categorization in the background; returns a job id to poll. */
export const aiCategorizeStart = () =>
  api<{ job_id: string }>("/categorize/ai", { method: "POST" });

/** Poll categorization status; when status === "done", `updated` holds the count. */
export const categorizeJob = (jobId: string) =>
  api<CategorizeJob>(`/categorize/ai/jobs/${jobId}`);
