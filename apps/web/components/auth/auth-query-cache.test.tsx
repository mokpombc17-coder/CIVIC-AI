import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionSync } from "./auth-session-sync";
import { clearAuthSessionData } from "./auth-session-data";
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
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map([
    ["civic:rag-conversation:v1", "previous conversation"],
    ["civic:rag-conversation-draft:v1", "previous draft"],
    ["civic.analytics-user-id.v1", "previous user ID"],
    ["unrelated-preference", "keep"],
  ]);
  vi.stubGlobal("window", {
    sessionStorage: { removeItem: (key: string) => stored.delete(key) },
  });
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

function expectSessionStorageCleared() {
  expect([...stored]).toEqual([["unrelated-preference", "keep"]]);
}

describe("logout query cache cleanup", () => {
  it("fetches the next account's eligibility even while the previous result was fresh", async () => {
    const client = cachePreviousAccount();
    const request = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await requestLogout(request)).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expectSessionStorageCleared();

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
    expect(await requestLogout(request)).toBe(false);
    expect(client.getQueryData(serviceEligibilityQueryKey)).toEqual({ eligible: true });
    expect(stored.size).toBe(4);
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

  it.each([
    ["LOGOUT", "/login"],
    ["LOGIN", "/home"],
  ])("clears the receiving tab's session data on %s before navigating", (message, destination) => {
    const client = cachePreviousAccount();
    const port = {
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      close: vi.fn(),
      postMessage: vi.fn(),
    };
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    vi.stubGlobal(
      "BroadcastChannel",
      vi.fn(function () {
        return port;
      }),
    );
    hooks.push.mockImplementation(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(0);
      expect(client.getMutationCache().getAll()).toHaveLength(0);
      expectSessionStorageCleared();
    });
    AuthSessionSync();
    cleanup = hooks.effect?.();
    port.onmessage?.({ data: message });
    expect(hooks.push).toHaveBeenCalledWith(destination);
    expect(request).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("clears cache when a password change invalidates the session", () => {
    const client = cachePreviousAccount();
    redirectAfterPasswordChange(() => {
      expect(client.getQueryCache().getAll()).toHaveLength(0);
      expectSessionStorageCleared();
    });
  });

  it("clears the query cache even when session storage is inaccessible", () => {
    const client = cachePreviousAccount();
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("storage blocked");
      },
    });
    expect(() => clearAuthSessionData()).not.toThrow();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
});
