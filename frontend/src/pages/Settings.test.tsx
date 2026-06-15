import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as authApi from "../api/auth";
import Settings from "./Settings";

vi.mock("../api/auth");
beforeEach(() => vi.clearAllMocks());

test("changes the password", async () => {
  vi.mocked(authApi.changePassword).mockResolvedValue({ ok: true });
  render(<Settings />);
  await userEvent.type(screen.getByLabelText(/current password/i), "old");
  await userEvent.type(screen.getByLabelText(/new password/i), "new");
  await userEvent.click(screen.getByRole("button", { name: /change password/i }));
  await waitFor(() => expect(vi.mocked(authApi.changePassword)).toHaveBeenCalledWith("old", "new"));
  expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
});
