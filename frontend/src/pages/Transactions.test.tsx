import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as categorizeApi from "../api/categorize";
import * as rulesApi from "../api/rules";
import * as txApi from "../api/transactions";
import Transactions from "./Transactions";

vi.mock("../api/accounts");
vi.mock("../api/categories");
vi.mock("../api/categorize");
vi.mock("../api/rules");
vi.mock("../api/transactions");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: null, currency: "USD", archived: false },
  ]);
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 3, name: "Dining", parent_id: null, color: "#f97316", icon: null },
  ]);
  vi.mocked(txApi.listTransactions).mockResolvedValue({
    total: 1,
    items: [
      {
        id: 10, account_id: 1, date: "2026-01-15", description: "PAYROLL",
        merchant: "PAYROLL", amount: 1500, direction: "credit", import_batch_id: 1,
        category_id: null, category_name: null,
      },
    ],
  });
  vi.mocked(txApi.recategorize).mockResolvedValue({
    id: 10, account_id: 1, date: "2026-01-15", description: "PAYROLL", merchant: "PAYROLL",
    amount: 1500, direction: "credit", import_batch_id: 1, category_id: 3, category_name: "Dining",
  });
});

test("renders transactions and applies a search filter", async () => {
  render(<Transactions />);
  expect(await screen.findByText("PAYROLL")).toBeInTheDocument();
  expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  // account_id -> name cross-reference renders in the row (would show "#1" if
  // the lookup broke, leaving only the dropdown <option> — so expect >= 2).
  expect(screen.getAllByText("Amex Gold").length).toBeGreaterThanOrEqual(2);

  await userEvent.type(screen.getByPlaceholderText(/search/i), "shell");
  await waitFor(() =>
    expect(vi.mocked(txApi.listTransactions)).toHaveBeenCalledWith(
      expect.objectContaining({ search: "shell" }),
    ),
  );
});

test("filtering by account re-queries with account_id", async () => {
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.selectOptions(screen.getByLabelText("Account filter"), "1");
  await waitFor(() =>
    expect(vi.mocked(txApi.listTransactions)).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 1 }),
    ),
  );
});

test("recategorizes a transaction inline", async () => {
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.selectOptions(screen.getByLabelText(/category for PAYROLL/i), "3");
  await waitFor(() =>
    expect(vi.mocked(txApi.recategorize)).toHaveBeenCalledWith(10, 3),
  );
});

test("Apply rules triggers applyRules and reloads", async () => {
  vi.mocked(rulesApi.applyRules).mockResolvedValue({ updated: 2 });
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.click(screen.getByRole("button", { name: /apply rules/i }));
  await waitFor(() => expect(vi.mocked(rulesApi.applyRules)).toHaveBeenCalled());
  expect(await screen.findByText(/2 transaction/i)).toBeInTheDocument();
});

test("Categorize with AI calls the endpoint and shows the count", async () => {
  vi.mocked(categorizeApi.aiCategorizeStart).mockResolvedValue({ job_id: "cat-1" });
  vi.mocked(categorizeApi.categorizeJob).mockResolvedValue({ status: "done", updated: 3, detail: null });
  render(<Transactions />);
  await screen.findByText("PAYROLL");
  await userEvent.click(screen.getByRole("button", { name: /categorize with ai/i }));
  await waitFor(() => expect(vi.mocked(categorizeApi.aiCategorizeStart)).toHaveBeenCalled());
  await waitFor(() => expect(vi.mocked(categorizeApi.categorizeJob)).toHaveBeenCalledWith("cat-1"));
  expect(await screen.findByText(/ai categorized 3/i)).toBeInTheDocument();
});
