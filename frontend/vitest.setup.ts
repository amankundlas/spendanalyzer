import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver; polyfill it so Recharts doesn't crash.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
