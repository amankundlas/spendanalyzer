import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as dashboardApi from "../api/dashboard";
import Overview from "./Overview";

vi.mock("../api/accounts");
vi.mock("../api/dashboard");

const renderOverview = () => render(<Overview />, { wrapper: MemoryRouter });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({
    totals: { spend: 110, income: 3000, net: 2890, count: 4 },
    by_category: [
      { category_id: 1, category_name: "Groceries", color: "#22c55e", spend: 100 },
      { category_id: null, category_name: "Uncategorized", color: null, spend: 10 },
    ],
    by_month: [
      { month: "2026-01", spend: 50, income: 0 },
      { month: "2026-02", spend: 60, income: 3000 },
    ],
  });
});

test("shows KPI totals and category legend", async () => {
  renderOverview();
  expect(await screen.findByText("$110.00")).toBeInTheDocument();
  expect(screen.getByText("$3,000.00")).toBeInTheDocument();
  expect(screen.getByText("$2,890.00")).toBeInTheDocument();
  expect(screen.getByText("Groceries")).toBeInTheDocument();
  expect(screen.getByText("Uncategorized")).toBeInTheDocument();
});

test("category legend rows deep-link to filtered transactions (carrying the month)", async () => {
  renderOverview();
  // The page defaults to the latest month with data, so links carry that scope.
  await waitFor(() =>
    expect(screen.getByText("Groceries").closest("a")).toHaveAttribute(
      "href",
      "/transactions?category_id=1&start=2026-02-01&end=2026-02-28",
    ),
  );
  // the null bucket -> ?uncategorized=true
  expect(screen.getByText("Uncategorized").closest("a")?.getAttribute("href")).toContain(
    "uncategorized=true",
  );
});

test("defaults to the latest month and offers an All-time option", async () => {
  renderOverview();
  const monthFilter = (await screen.findByLabelText("Month filter")) as HTMLSelectElement;
  expect(screen.getByRole("option", { name: "All time" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "February 2026" })).toBeInTheDocument();
  await waitFor(() => expect(monthFilter.value).toBe("2026-02")); // newest month selected
});
