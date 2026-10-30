import { beforeEach, describe, expect, it, vi } from "vitest";

describe("query cache control", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does nothing when React Query has not been loaded", async () => {
    const { clearAppQueryCacheIfLoaded } = await import("./query-cache-control");

    expect(() => clearAppQueryCacheIfLoaded()).not.toThrow();
  });

  it("clears the registered browser QueryClient without owning its implementation", async () => {
    const { clearAppQueryCacheIfLoaded, registerAppQueryCacheClearer } =
      await import("./query-cache-control");
    const clear = vi.fn();

    registerAppQueryCacheClearer(clear);
    clearAppQueryCacheIfLoaded();

    expect(clear).toHaveBeenCalledOnce();
  });
});
