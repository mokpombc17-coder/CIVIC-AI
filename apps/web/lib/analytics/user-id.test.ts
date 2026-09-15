import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_USER_ID_STORAGE_KEY,
  clearAnalyticsUserId,
  storeAnalyticsUserId,
} from "./user-id";

const userId = "46fd4756-f07f-4b54-b03a-6e07740317da";

describe("analytics user ID session storage", () => {
  it("stores a valid UUID under the shared analytics key", () => {
    const storage = { setItem: vi.fn() };

    expect(storeAnalyticsUserId(userId, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(ANALYTICS_USER_ID_STORAGE_KEY, userId);
  });

  it("does not store a malformed user ID", () => {
    const storage = { setItem: vi.fn() };

    expect(storeAnalyticsUserId("user09@example.com", storage)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("removes the cached ID without propagating storage failures", () => {
    const storage = { removeItem: vi.fn() };

    expect(clearAnalyticsUserId(storage)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith(ANALYTICS_USER_ID_STORAGE_KEY);
    expect(
      clearAnalyticsUserId({
        removeItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});
