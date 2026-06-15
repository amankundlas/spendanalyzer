import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as dashboardApi from "../api/dashboard";
import Overview from "./Overview";

vi.mock("../api/accounts");
vi.mock("../api/dashboard");

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
  render(<Overview />);
  expect(await screen.findByText("$110.00")).toBeInTheDocument();
  expect(screen.getByText("$3,000.00")).toBeInTheDocument();
  expect(screen.getByText("$2,890.00")).toBeInTheDocument();
  expect(screen.getByText("Groceries")).toBeInTheDocument();
  expect(screen.getByText("Uncategorized")).toBeInTheDocument();
});
