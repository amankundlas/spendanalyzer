const BASE = "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
}

export const getHealth = () => api<HealthResponse>("/health");
