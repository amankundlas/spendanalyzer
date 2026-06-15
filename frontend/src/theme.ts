import { useEffect, useState } from "react";

const KEY = "sa-theme";

/** Reads the persisted theme and applies the `.dark` class. Call once, before render. */
export function applyStoredTheme() {
  const saved = localStorage.getItem(KEY);
  const prefersDark =
    !saved && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", saved === "dark" || !!prefersDark);
}

/** Theme state synced to <html class="dark"> + localStorage. */
export function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

/** Chart colors (legible on both light & dark). */
export const CHART = {
  income: "#5b6ef0",
  spend: "#fb6f92",
  grid: "rgba(135,140,155,0.18)",
  fallback: "#94a3b8",
};
