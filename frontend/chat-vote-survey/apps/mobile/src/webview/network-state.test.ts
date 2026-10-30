import { describe, expect, it } from "vitest";
import { getNetworkAvailability, shouldAutoRetryAfterNetworkRecovery } from "./network-state";

describe("getNetworkAvailability", () => {
  it("keeps the initial unobserved state unknown", () => {
    expect(getNetworkAvailability({})).toBe("unknown");
  });

  it("reports offline when the device or internet is disconnected", () => {
    expect(getNetworkAvailability({ isConnected: false })).toBe("offline");
    expect(
      getNetworkAvailability({
        isConnected: true,
        isInternetReachable: false,
      }),
    ).toBe("offline");
  });

  it("reports online for an active connection while reachability is being resolved", () => {
    expect(getNetworkAvailability({ isConnected: true })).toBe("online");
  });
});

describe("shouldAutoRetryAfterNetworkRecovery", () => {
  it("retries only a network load failure after an offline-to-online transition", () => {
    expect(shouldAutoRetryAfterNetworkRecovery("offline", "online", true)).toBe(true);
    expect(shouldAutoRetryAfterNetworkRecovery("offline", "online", false)).toBe(false);
    expect(shouldAutoRetryAfterNetworkRecovery("online", "online", true)).toBe(false);
    expect(shouldAutoRetryAfterNetworkRecovery("unknown", "online", true)).toBe(false);
  });
});
