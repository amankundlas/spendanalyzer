import { useEffect, useRef, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import {
  ColumnMapping,
  ImportBatch,
  ImportPreview,
  ParsedRow,
  analyzeCsv,
  commitImport,
  deleteBatch,
  listBatches,
  pdfCommit,
  pdfExtractStart,
  pdfJob,
  previewImport,
} from "../api/imports";
import PageHeader from "../components/PageHeader";
import { Button, Card, CardHeader, EmptyState, Select } from "../components/ui";

export default function Import() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a successful save so the file <input> remounts and clears,
  // letting the user re-import the same filename.
  const [fileKey, setFileKey] = useState(0);
  // PDF flow state
  const [pdfRows, setPdfRows] = useState<ParsedRow[] | null>(null);
  const [pdfName, setPdfName] = useState("statement.pdf");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMethod, setPdfMethod] = useState<"parser" | "ai" | null>(null);
  // Bumped on every extraction run so any in-flight poll is abandoned.
  const pollToken = useRef(0);

  const refreshBatches = (id: number) =>
    listBatches(id).then(setBatches).catch(() => undefined);

  useEffect(() => {
    listAccounts().then((a) => {
      setAccounts(a);
      if (a.length && accountId === undefined) setAccountId(a[0].id);
    });
  }, []);

  useEffect(() => {
    if (accountId !== undefined) refreshBatches(accountId);
  }, [accountId]);

  // Start a PDF extraction (background job + poll). mode "auto" tries the fast
  // text parser first; "ai" forces the LLM (the manual "re-read with AI" path).
  const runPdfExtraction = async (f: File, mode: "auto" | "ai") => {
    const myToken = (pollToken.current += 1); // abandon any prior poll
    setError(null);
    setMessage(null);
    setPdfRows(null);
    setPdfMethod(null);
    setPdfBusy(true);
    try {
      const { job_id } = await pdfExtractStart(f, mode);
      let fails = 0;
      const poll = async () => {
        if (pollToken.current !== myToken) return; // a newer run took over
        try {
          const job = await pdfJob(job_id);
          if (pollToken.current !== myToken) return;
          if (job.status === "done") {
            setPdfRows(job.rows ?? []);
            setPdfMethod(job.method);
            setPdfBusy(false);
            return;
          }
          if (job.status === "error") {
            setError(job.detail ?? "Couldn't read this PDF.");
            setPdfBusy(false);
            return;
          }
          fails = 0; // a clean poll resets the transient-failure counter
        } catch {
          if (++fails > 5) {
            setError("Lost the connection while reading the PDF. Please try again.");
            setPdfBusy(false);
            return;
          }
        }
        window.setTimeout(poll, 2500);
      };
      poll();
    } catch (e) {
      setError((e as Error).message);
      setPdfBusy(false);
    }
  };

  const onFile = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setMessage(null);
    setError(null);
    setHeaders([]); // clear any prior file's mapping eagerly
    setMapping(null);
    setPdfRows(null);
    pollToken.current += 1; // cancel any prior extraction poll
    if (!f) return;
    const isPdf =
      f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
    if (isPdf) {
      setPdfName(f.name);
      runPdfExtraction(f, "auto");
      return;
    }
    try {
      const detected = await analyzeCsv(f);
      setHeaders(detected.headers);
      setMapping(detected.suggested);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doPdfSave = async () => {
    if (!pdfRows) return;
    if (accountId === undefined) {
      setError("Select an account first (create one on the Accounts page).");
      return;
    }
    setError(null);
    try {
      const result = await pdfCommit(accountId, pdfName, pdfRows);
      setMessage(`Imported ${result.added_count}, skipped ${result.duplicate_count} duplicate(s).`);
      setPdfRows(null);
      setPdfMethod(null);
      setFile(null);
      setFileKey((k) => k + 1);
      await refreshBatches(accountId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doPreview = async () => {
    if (!file || !mapping) return;
    if (accountId === undefined) {
      setError("Select an account first (create one on the Accounts page).");
      return;
    }
    setError(null);
    try {
      setPreview(await previewImport(accountId, mapping, file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doSave = async () => {
    if (!file || !mapping) return;
    if (accountId === undefined) {
      setError("Select an account first (create one on the Accounts page).");
      return;
    }
    setError(null);
    try {
      const result = await commitImport(accountId, mapping, file);
      setMessage(`Imported ${result.added_count}, skipped ${result.duplicate_count} duplicate(s).`);
      setFile(null);
      setMapping(null);
      setHeaders([]);
      setPreview(null);
      setFileKey((k) => k + 1);
      await refreshBatches(accountId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeBatch = async (id: number) => {
    setError(null);
    try {
      await deleteBatch(id);
      setMessage("Import deleted.");
      if (accountId !== undefined) await refreshBatches(accountId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setMap = (field: keyof ColumnMapping, value: string) =>
    setMapping((m) => (m ? { ...m, [field]: value === "" ? null : value } : m));

  return (
    <main>
      <PageHeader title="Import" subtitle="Upload a CSV or PDF statement to add transactions." />

      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Account
            <Select
              aria-label="Account"
              className="mt-1.5"
              value={accountId ?? ""}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Statement file (CSV or PDF)
            <input
              key={fileKey}
              type="file"
              accept=".csv,.pdf,text/csv,application/pdf"
              className="mt-1.5 text-sm text-ink2 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-soft file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-accent-d"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </Card>

      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}
      {message && <p className="mb-4 text-sm font-semibold text-ok">{message}</p>}
      {pdfBusy && (
        <p className="mb-4 text-sm font-semibold text-muted">
          Reading the PDF… usually instant; if it falls back to the local AI this can take a
          minute or two — keep this page open.
        </p>
      )}

      {pdfRows && (
        <Card className="mb-4 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink2">
              <strong className="font-extrabold text-ink">{pdfRows.length}</strong> transaction(s){" "}
              {pdfMethod === "parser"
                ? "read instantly from the PDF text"
                : "extracted by the local AI"}{" "}
              — review, then save. (Nothing is stored until you click Save.)
            </p>
            {pdfMethod === "parser" && file && (
              <Button variant="ghost" onClick={() => runPdfExtraction(file, "ai")}>
                Re-read with AI
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="py-2.5 pr-3">Date</th>
                <th scope="col" className="pr-3">Description</th>
                <th scope="col" className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pdfRows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-ink2 tabnum">{r.date}</td>
                  <td className="pr-3 text-ink">{r.description}</td>
                  <td className="text-right tabnum font-semibold text-ink">
                    {(r.amount_cents / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
              {pdfRows.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <EmptyState>
                      No transactions were extracted — the PDF may be an unusual format.
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {pdfRows.length > 0 && (
            <Button className="mt-4" onClick={doPdfSave}>
              Save import
            </Button>
          )}
        </Card>
      )}

      {mapping && headers.length > 0 && (
        <Card className="mb-4 p-5">
          <CardHeader title="Confirm column mapping" />
          <div className="flex flex-wrap gap-3">
            {(["date", "description", "amount", "debit", "credit"] as const).map((field) => (
              <label key={field} className="flex flex-col text-[13px] font-semibold capitalize text-ink2">
                {field}
                <Select
                  aria-label={`${field} column`}
                  className="mt-1.5"
                  value={(mapping[field] as string) ?? ""}
                  onChange={(e) => setMap(field, e.target.value)}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <Button variant="ghost" className="mt-4" onClick={doPreview}>
            Preview
          </Button>
        </Card>
      )}

      {preview && (
        <Card className="mb-4 p-5">
          <p className="mb-3 text-sm font-medium text-ink2">
            <strong className="font-extrabold text-ink">{preview.added_count} new</strong>, {preview.duplicate_count} duplicate(s)
            will be skipped.
          </p>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
                <th scope="col" className="py-2.5 pr-3">Date</th>
                <th scope="col" className="pr-3">Description</th>
                <th scope="col" className="text-right">Amount (cents)</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-ink2 tabnum">{r.date}</td>
                  <td className="pr-3 text-ink">{r.description}</td>
                  <td className="text-right tabnum font-semibold text-ink">{r.amount_cents}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Button className="mt-4" onClick={doSave}>
            Save import
          </Button>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title="Recent imports" />
        <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="py-2.5 pr-3">File</th>
              <th scope="col" className="pr-3">Added</th>
              <th scope="col" className="pr-3">Duplicates</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-line/70 last:border-0">
                <td className="py-2.5 pr-3 font-semibold text-ink">{b.filename}</td>
                <td className="pr-3 tabnum text-ok">{b.added_count}</td>
                <td className="pr-3 tabnum text-ink2">{b.duplicate_count}</td>
                <td className="text-right">
                  <button
                    className="text-xs font-bold text-muted transition-colors hover:text-spend cursor-pointer"
                    aria-label={`Delete import ${b.filename}`}
                    onClick={() => removeBatch(b.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState>No imports yet.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </main>
  );
}
