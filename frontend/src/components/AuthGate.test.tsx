import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as authApi from "../api/auth";
import AuthGate from "./AuthGate";

vi.mock("../api/auth");

beforeEach(() => vi.clearAllMocks());

test("renders children when authenticated", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: true, authenticated: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  expect(await screen.findByText("SECRET APP")).toBeInTheDocument();
});

test("shows login when configured but not authenticated, then unlocks", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: true, authenticated: false });
  vi.mocked(authApi.authLogin).mockResolvedValue({ ok: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  const pw = await screen.findByLabelText(/password/i);
  await userEvent.type(pw, "hunter2");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
  await waitFor(() => expect(vi.mocked(authApi.authLogin)).toHaveBeenCalledWith("hunter2"));
  expect(await screen.findByText("SECRET APP")).toBeInTheDocument();
});

test("shows setup when not configured", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: false, authenticated: false });
  vi.mocked(authApi.authSetup).mockResolvedValue({ ok: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  expect(await screen.findByText(/set a password/i)).toBeInTheDocument();
});
