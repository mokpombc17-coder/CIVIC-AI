import { describe, expect, it, vi } from "vitest";
import {
  createPwaSessionInitializer,
  PWA_MINIMUM_SPLASH_MS,
  requestPwaSession,
  waitForMinimumPwaSplash,
} from "./session-bootstrap";

describe("PWA session bootstrap", () => {
  it("does not call Refresh while offline", async () => {
    const request = vi.fn<typeof fetch>();

    await expect(requestPwaSession({ online: false, request })).resolves.toEqual({
      status: "retryable-error",
      reason: "offline",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [204, { status: "authenticated" }],
    [401, { status: "unauthenticated" }],
    [403, { status: "unauthenticated" }],
    [429, { status: "retryable-error", reason: "rate-limited" }],
    [503, { status: "retryable-error", reason: "server" }],
    [409, { status: "retryable-error", reason: "unexpected-response" }],
  ] as const)("maps provisional Refresh status %s", async (status, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));

    await expect(requestPwaSession({ request })).resolves.toEqual(expected);
    expect(request).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("keeps network failures retryable", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));

    await expect(requestPwaSession({ request })).resolves.toEqual({
      status: "retryable-error",
      reason: "network",
    });
  });

  it("shares one initialization request while it is in flight", async () => {
    let resolveRequest: ((result: { status: "authenticated" }) => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<{ status: "authenticated" }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const initialize = createPwaSessionInitializer(run);

    const first = initialize(true);
    const second = initialize(true);
    expect(run).toHaveBeenCalledOnce();
    resolveRequest?.({ status: "authenticated" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "authenticated" },
      { status: "authenticated" },
    ]);
  });

  it("waits for the minimum splash duration as well as the session result", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const result = Promise.resolve({ status: "authenticated" } as const);

    await expect(waitForMinimumPwaSplash(result, pause)).resolves.toEqual({
      status: "authenticated",
    });
    expect(pause).toHaveBeenCalledWith(PWA_MINIMUM_SPLASH_MS);
    expect(PWA_MINIMUM_SPLASH_MS).toBe(1_500);
  });
});
