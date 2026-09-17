import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionSync } from "./auth-session-sync";
import { requestLogout } from "./logout-button";
import { redirectAfterPasswordChange } from "@/components/screens/account-functional-screen";
import { clearAppQueryCache, getAppQueryClient } from "@/components/providers/app-query-provider";
import { serviceEligibilityQueryKey } from "@/lib/vote/service-eligibility";

const hooks = vi.hoisted(() => ({
  push: vi.fn(),
  effect: undefined as (() => void | (() => void)) | undefined,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hooks.push }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => {
    hooks.effect = effect;
  },
}));

let cleanup: void | (() => void);
beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("BroadcastChannel", undefined);
  hooks.push.mockReset();
  clearAppQueryCache();
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  clearAppQueryCache();
  vi.unstubAllGlobals();
});

function cachePreviousAccount() {
  const client = getAppQueryClient();
  client.setQueryData(["current-user", "role"], "PARTICIPANT");
  client.setQueryData(serviceEligibilityQueryKey, { eligible: true });
  client.getMutationCache().build(client, { mutationKey: ["previous-account"] });
  return client;
}

describe("logout query cache cleanup", () => {
  it("fetches the next account's eligibility even while the previous result was fresh", async () => {
    const client = cachePreviousAccount();
    const request = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await requestLogout(request, null)).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);

    const loadNextAccount = vi.fn(async () => ({ eligible: false }));
    expect(
      await client.fetchQuery({
        queryKey: serviceEligibilityQueryKey,
        queryFn: loadNextAccount,
        staleTime: 300_000,
      }),
    ).toEqual({ eligible: false });
    expect(loadNextAccount).toHaveBeenCalledOnce();
  });

  it.each(["http", "network"])("keeps the current cache on %s logout failure", async (failure) => {
    const client = cachePreviousAccount();
    const request = vi.fn(async () => {
      if (failure === "network") throw new Error("offline");
      return new Response(null, { status: 503 });
    });
    expect(await requestLogout(request, null)).toBe(false);
    expect(client.getQueryData(serviceEligibilityQueryKey)).toEqual({ eligible: true });
  });

  it("cancels a previous account's pending query so its late response stays out of the cache", async () => {
    const client = getAppQueryClient();
    let resolve!: (value: { eligible: boolean }) => void;
    let signal!: AbortSignal;
    const pending = client.fetchQuery({
      queryKey: serviceEligibilityQueryKey,
      queryFn: (context) => {
        signal = context.signal;
        return new Promise<{ eligible: boolean }>((done) => {
          resolve = done;
        });
      },
    });
    const settled = pending.catch(() => undefined);
    await requestLogout(async () => new Response(null, { status: 204 }), null);
    expect(signal.aborted).toBe(true);
    resolve({ eligible: true });
    await settled;
    expect(client.getQueryData(serviceEligibilityQueryKey)).toBeUndefined();
  });

  it("clears the receiving tab before pushing the login route", () => {
    const client = cachePreviousAccount();
    const port = {
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      close: vi.fn(),
    };
    vi.stubGlobal(
      "BroadcastChannel",
      vi.fn(function () {
        return port;
      }),
    );
    hooks.push.mockImplementation(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(0);
      expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
    AuthSessionSync();
    cleanup = hooks.effect?.();
    port.onmessage?.({ data: "LOGOUT" });
    expect(hooks.push).toHaveBeenCalledWith("/login");
  });

  it("clears cache when a password change invalidates the session", () => {
    const client = cachePreviousAccount();
    redirectAfterPasswordChange(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    });
  });
});
