import { api } from "./client";

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
}

export const authStatus = () => api<AuthStatus>("/auth/status");
export const authSetup = (password: string) =>
  api<{ ok: boolean }>("/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
export const authLogin = (password: string) =>
  api<{ ok: boolean }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
export const authLogout = () => api<{ ok: boolean }>("/auth/logout", { method: "POST" });
export const changePassword = (current_password: string, new_password: string) =>
  api<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
