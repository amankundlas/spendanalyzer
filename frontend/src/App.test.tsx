import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import * as dashboardApi from "./api/dashboard";
import * as accountsApi from "./api/accounts";
import App from "./App";

vi.mock("./api/dashboard");
vi.mock("./api/accounts");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([]);
  vi.mocked(dashboardApi.getDashboard).mockResolvedValue({
    totals: { spend: 0, income: 0, net: 0, count: 0 },
    by_category: [],
    by_month: [],
  });
});

test("renders sidebar and the Overview heading on the home route", async () => {
  render(
    <MemoryRouter
      initialEntries={["/"]}
    >
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Spend Analyzer")).toBeInTheDocument();
  expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
});
