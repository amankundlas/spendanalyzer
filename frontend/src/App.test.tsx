import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "ok" }),
      }),
    ),
  );
});

test("renders sidebar and the Overview health status on the home route", async () => {
  render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Spend Analyzer")).toBeInTheDocument();
  expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
  expect(await screen.findByText("ok")).toBeInTheDocument();
});
