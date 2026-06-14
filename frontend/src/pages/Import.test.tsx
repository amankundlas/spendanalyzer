import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as importsApi from "../api/imports";
import Import from "./Import";

vi.mock("../api/accounts");
vi.mock("../api/imports");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: null, currency: "USD", archived: false },
  ]);
  vi.mocked(importsApi.listBatches).mockResolvedValue([]);
  vi.mocked(importsApi.analyzeCsv).mockResolvedValue({
    headers: ["Date", "Description", "Amount"],
    sample_rows: [{ Date: "2026-01-02", Description: "WHOLE FOODS", Amount: "-45.99" }],
    suggested: { date: "Date", description: "Description", amount: "Amount" },
  });
  vi.mocked(importsApi.previewImport).mockResolvedValue({
    rows: [{ date: "2026-01-02", description: "WHOLE FOODS", amount_cents: -4599, direction: "debit" }],
    added_count: 1,
    duplicate_count: 0,
  });
  vi.mocked(importsApi.commitImport).mockResolvedValue({
    batch_id: 5, added_count: 1, duplicate_count: 0,
  });
  vi.mocked(importsApi.deleteBatch).mockResolvedValue(undefined);
});

function selectFile() {
  const file = new File(["Date,Description,Amount\n2026-01-02,WHOLE FOODS,-45.99\n"], "stmt.csv", {
    type: "text/csv",
  });
  return userEvent.upload(screen.getByLabelText(/csv file/i), file);
}

test("guides upload -> analyze -> preview -> save", async () => {
  render(<Import />);
  await screen.findByText("Amex Gold"); // accounts loaded into the select

  await selectFile();
  await waitFor(() => expect(vi.mocked(importsApi.analyzeCsv)).toHaveBeenCalled());

  // preview
  await userEvent.click(await screen.findByRole("button", { name: /preview/i }));
  expect(await screen.findByText(/1 new/i)).toBeInTheDocument();

  // save
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(vi.mocked(importsApi.commitImport)).toHaveBeenCalled());
  expect(await screen.findByText(/imported 1/i)).toBeInTheDocument();
});

test("deletes a batch and refreshes the recent-imports list", async () => {
  vi.mocked(importsApi.listBatches)
    .mockResolvedValueOnce([
      { id: 7, account_id: 1, source: "csv", filename: "old.csv", imported_at: "2026-01-01T00:00:00", added_count: 3, duplicate_count: 0 },
    ])
    .mockResolvedValue([]); // refreshed list after delete is empty

  render(<Import />);
  await screen.findByText("old.csv");
  await userEvent.click(screen.getByRole("button", { name: /delete import old\.csv/i }));

  await waitFor(() => expect(vi.mocked(importsApi.deleteBatch)).toHaveBeenCalledWith(7));
  // list actually refreshed (not gated by a duplicate message string)
  await waitFor(() => expect(screen.queryByText("old.csv")).not.toBeInTheDocument());
});

test("surfaces an error when analyze fails", async () => {
  vi.mocked(importsApi.analyzeCsv).mockRejectedValueOnce(new Error("bad file"));
  render(<Import />);
  await screen.findByText("Amex Gold");
  await selectFile();
  expect(await screen.findByText("bad file")).toBeInTheDocument();
});
