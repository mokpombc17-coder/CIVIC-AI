import { beforeAll, describe, expect, it, vi } from "vitest";

let normalizeDeepLink: (rawUrl: string) => string | null;

beforeAll(async () => {
  vi.stubGlobal("__DEV__", true);
  ({ normalizeDeepLink } = await import("./deep-link"));
});

describe("normalizeDeepLink", () => {
  it("maps the native scheme to the configured web origin", () => {
    expect(normalizeDeepLink("nextwebview://products/123?tab=details#price")).toBe(
      "http://localhost:3000/products/123?tab=details#price",
    );
  });

  it("accepts safe relative application routes", () => {
    expect(normalizeDeepLink("/orders/123?from=push")).toBe(
      "http://localhost:3000/orders/123?from=push",
    );
  });

  it("rejects protocol-relative and external URLs", () => {
    expect(normalizeDeepLink("//evil.example/path")).toBeNull();
    expect(normalizeDeepLink("https://evil.example/path")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(normalizeDeepLink("not a url")).toBeNull();
  });
});
