import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import Budgets from "./Budgets";

vi.mock("../api/budgets");
vi.mock("../api/categories");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 1, name: "Groceries", parent_id: null, color: "#22c55e", icon: null },
  ]);
  vi.mocked(budgetsApi.listBudgets).mockResolvedValue([
    { id: 5, category_id: 1, month: "recurring", limit: 400 },
  ]);
  vi.mocked(budgetsApi.upsertBudget).mockResolvedValue({
    id: 5, category_id: 1, month: "recurring", limit: 500,
  });
  vi.mocked(budgetsApi.budgetStatus).mockResolvedValue([
    {
      category_id: 1, category_name: "Groceries", color: "#22c55e", month: "2026-02",
      limit: 400, spent: 450, remaining: -50, pct: 1.125, status: "over",
    },
  ]);
});

test("shows budget status and sets a limit", async () => {
  render(<Budgets />);
  expect(await screen.findByText("Groceries")).toBeInTheDocument();
  expect(await screen.findByText(/over/i)).toBeInTheDocument();

  const input = screen.getByLabelText(/budget for Groceries/i);
  await userEvent.clear(input);
  await userEvent.type(input, "500");
  await userEvent.click(screen.getByRole("button", { name: /save Groceries budget/i }));
  await waitFor(() =>
    expect(vi.mocked(budgetsApi.upsertBudget)).toHaveBeenCalledWith(1, 500, "recurring"),
  );
});
