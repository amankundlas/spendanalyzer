import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import * as dashboardApi from "../api/dashboard";
import Trends from "./Trends";

vi.mock("../api/accounts");
vi.mock("../api/dashboard");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({
    totals: { spend: 110, income: 3000, net: 2890, count: 4 },
    by_category: [{ category_id: 1, category_name: "Groceries", color: "#22c55e", spend: 100 }],
    by_month: [
      { month: "2026-01", spend: 50, income: 0 },
      { month: "2026-02", spend: 60, income: 3000 },
    ],
  });
});

test("renders the monthly trend with a per-month table", async () => {
  render(<Trends />);
  expect(await screen.findByText(/monthly/i)).toBeInTheDocument();
  // a textual month row exists (chart SVG is not asserted in jsdom)
  expect(screen.getByText("2026-02")).toBeInTheDocument();
  // net column computed (income - spend) for 2026-02 = 3000 - 60 = 2940
  expect(screen.getByText("$2,940.00")).toBeInTheDocument();
});
