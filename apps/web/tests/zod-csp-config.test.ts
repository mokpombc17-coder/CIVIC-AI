import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const originalJitless = z.config().jitless;

describe("Zod client instrumentation", () => {
  afterEach(() => {
    z.config({ jitless: originalJitless });
  });

  it("disables runtime code generation before client hydration", async () => {
    z.config({ jitless: false });
    vi.resetModules();

    await import("../instrumentation-client");

    expect(z.config().jitless).toBe(true);
  });
});
