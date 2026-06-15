import { useEffect, useState } from "react";
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
  pdfExtract,
  previewImport,
} from "../api/imports";

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

  const onFile = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setMessage(null);
    setError(null);
    setHeaders([]); // clear any prior file's mapping eagerly
    setMapping(null);
    setPdfRows(null);
    if (!f) return;
    const isPdf =
      f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
    if (isPdf) {
      setPdfName(f.name);
      setPdfBusy(true);
      try {
        const { rows } = await pdfExtract(f);
        setPdfRows(rows);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPdfBusy(false);
      }
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
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Import</h2>

      <div className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col">
          Account
          <select
            aria-label="Account"
            className="mt-1 rounded border border-slate-300 px-2 py-1"
            value={accountId ?? ""}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Statement file (CSV or PDF)
          <input
            key={fileKey}
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            className="mt-1"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-emerald-700">{message}</p>}
      {pdfBusy && (
        <p className="mb-4 text-sm text-slate-500">
          Extracting transactions from the PDF with the local AI… (this can take a moment)
        </p>
      )}

      {pdfRows && (
        <section className="mb-6 rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm">
            <strong>{pdfRows.length}</strong> transaction(s) extracted by the local AI —
            review, then save. (Nothing is stored until you click Save.)
          </p>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th scope="col" className="py-1">Date</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pdfRows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1">{r.date}</td>
                  <td>{r.description}</td>
                  <td className="text-right tabular-nums">
                    {(r.amount_cents / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
              {pdfRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-slate-400">
                    No transactions were extracted — the PDF may be an unusual format.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {pdfRows.length > 0 && (
            <button
              className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              onClick={doPdfSave}
            >
              Save import
            </button>
          )}
        </section>
      )}

      {mapping && headers.length > 0 && (
        <section className="mb-6 rounded-lg border border-slate-200 p-4">
          <h3 className="mb-3 font-medium">Confirm column mapping</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["date", "description", "amount", "debit", "credit"] as const).map((field) => (
              <label key={field} className="flex flex-col capitalize">
                {field}
                <select
                  aria-label={`${field} column`}
                  className="mt-1 rounded border border-slate-300 px-2 py-1"
                  value={(mapping[field] as string) ?? ""}
                  onChange={(e) => setMap(field, e.target.value)}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="mt-4 rounded bg-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-300"
            onClick={doPreview}
          >
            Preview
          </button>
        </section>
      )}

      {preview && (
        <section className="mb-6 rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm">
            <strong>{preview.added_count} new</strong>, {preview.duplicate_count} duplicate(s)
            will be skipped.
          </p>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th scope="col" className="py-1">Date</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Amount (cents)</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1">{r.date}</td>
                  <td>{r.description}</td>
                  <td className="text-right tabular-nums">{r.amount_cents}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            onClick={doSave}
          >
            Save import
          </button>
        </section>
      )}

      <section>
        <h3 className="mb-3 font-medium">Recent imports</h3>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th scope="col" className="py-1">File</th>
              <th scope="col">Added</th>
              <th scope="col">Duplicates</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-1">{b.filename}</td>
                <td>{b.added_count}</td>
                <td>{b.duplicate_count}</td>
                <td className="text-right">
                  <button
                    className="text-xs text-slate-500 hover:text-rose-600"
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
                <td colSpan={4} className="py-3 text-slate-400">
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
