import { api } from "./client";

export interface ColumnMapping {
  date: string;
  description: string;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  date_format?: string | null;
  debit_positive?: boolean;
}

export interface DetectedColumns {
  headers: string[];
  sample_rows: Record<string, string>[];
  suggested: ColumnMapping;
}

export interface ParsedRow {
  date: string;
  description: string;
  amount_cents: number;
  direction: string;
}

export interface ImportPreview {
  rows: ParsedRow[];
  added_count: number;
  duplicate_count: number;
}

export interface ImportResult {
  batch_id: number;
  added_count: number;
  duplicate_count: number;
}

export interface ImportBatch {
  id: number;
  account_id: number;
  source: string;
  filename: string;
  imported_at: string;
  added_count: number;
  duplicate_count: number;
}

function importForm(accountId: number, mapping: ColumnMapping, file: File): FormData {
  const fd = new FormData();
  fd.append("account_id", String(accountId));
  fd.append("mapping", JSON.stringify(mapping));
  fd.append("file", file);
  return fd;
}

export const analyzeCsv = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<DetectedColumns>("/imports/analyze", { method: "POST", body: fd });
};

export const previewImport = (accountId: number, mapping: ColumnMapping, file: File) =>
  api<ImportPreview>("/imports/commit?dry_run=true", {
    method: "POST",
    body: importForm(accountId, mapping, file),
  });

export const commitImport = (accountId: number, mapping: ColumnMapping, file: File) =>
  api<ImportResult>("/imports/commit", {
    method: "POST",
    body: importForm(accountId, mapping, file),
  });

export const listBatches = (accountId: number) =>
  api<ImportBatch[]>(`/imports?account_id=${accountId}`);

export const deleteBatch = (id: number) =>
  api<void>(`/imports/${id}`, { method: "DELETE" });

export interface Reconciliation {
  status: "match" | "mismatch" | "unverified";
  captured_count: number;
  captured_charges: number;
  captured_credits: number;
  captured_net: number;
  previous_balance: number | null;
  new_balance: number | null;
  statement_net: number | null;
  difference: number | null;
}

export interface PdfJob {
  status: "pending" | "running" | "done" | "error";
  rows: ParsedRow[] | null;
  method: "parser" | "ai" | null;
  reconciliation: Reconciliation | null;
  detail: string | null;
}

/**
 * Kick off background extraction; returns a job id to poll.
 * mode "auto" (default) tries the fast text parser first, LLM only as fallback;
 * mode "ai" forces the LLM (the manual "re-read with AI" path).
 */
export const pdfExtractStart = (file: File, mode: "auto" | "ai" = "auto") => {
  const fd = new FormData();
  fd.append("file", file);
  const qs = mode === "ai" ? "?mode=ai" : "";
  return api<{ job_id: string }>(`/imports/pdf/extract${qs}`, { method: "POST", body: fd });
};

/** Poll extraction status; when status === "done", `rows` holds the result. */
export const pdfJob = (jobId: string) => api<PdfJob>(`/imports/pdf/jobs/${jobId}`);

export const pdfCommit = (accountId: number, filename: string, rows: ParsedRow[]) =>
  api<ImportResult>("/imports/pdf/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: accountId, filename, rows }),
  });
