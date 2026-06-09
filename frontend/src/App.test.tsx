import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      }),
    ),
  );
});

test("renders sidebar and shows API status", async () => {
  render(<App />);
  expect(screen.getByText("Spend Analyzer")).toBeInTheDocument();
  expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
  expect(await screen.findByText("ok")).toBeInTheDocument();
});
