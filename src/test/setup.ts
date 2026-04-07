import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  const storage = (window as { localStorage?: unknown }).localStorage;
  if (
    storage &&
    typeof storage === "object" &&
    "clear" in storage &&
    typeof storage.clear === "function"
  ) {
    storage.clear();
  }
  cleanup();
});
