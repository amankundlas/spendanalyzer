import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import Accounts from "./Accounts";

vi.mock("../api/accounts");

beforeEach(() => {
  vi.mocked(accountsApi.listAccounts).mockResolvedValue([
    { id: 1, name: "Amex Gold", type: "credit", institution: "Amex", currency: "USD", archived: false },
  ]);
  vi.mocked(accountsApi.createAccount).mockResolvedValue({
    id: 2, name: "Checking", type: "checking", institution: null, currency: "USD", archived: false,
  });
  vi.mocked(accountsApi.archiveAccount).mockResolvedValue(undefined);
});

test("lists accounts and creates a new one", async () => {
  render(<Accounts />);
  expect(await screen.findByText("Amex Gold")).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Name"), "Checking");
  await userEvent.click(screen.getByRole("button", { name: /add account/i }));

  await waitFor(() =>
    expect(vi.mocked(accountsApi.createAccount)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Checking", type: "credit" }),
    ),
  );
});

test("archives an account", async () => {
  render(<Accounts />);
  await screen.findByText("Amex Gold");
  await userEvent.click(screen.getByRole("button", { name: /archive amex gold/i }));
  await waitFor(() =>
    expect(vi.mocked(accountsApi.archiveAccount)).toHaveBeenCalledWith(1),
  );
});

test("surfaces an error when archive fails", async () => {
  vi.mocked(accountsApi.archiveAccount).mockRejectedValueOnce(new Error("boom"));
  render(<Accounts />);
  await screen.findByText("Amex Gold");
  await userEvent.click(screen.getByRole("button", { name: /archive amex gold/i }));
  expect(await screen.findByText("boom")).toBeInTheDocument();
});
