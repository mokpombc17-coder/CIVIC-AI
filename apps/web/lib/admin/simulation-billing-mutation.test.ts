import { describe, expect, it } from "vitest";
import {
  IdempotentMutationKeys,
  mutationFingerprint,
  toKoreanCalendarDate,
} from "./simulation-billing-mutation";

describe("simulation billing mutation safety", () => {
  it("reuses a key while the same mutation outcome is uncertain", () => {
    let sequence = 0;
    const keys = new IdempotentMutationKeys(() => `key-${++sequence}`);
    const fingerprint = mutationFingerprint("/coupons", { amountKrw: 10_000, reason: "예산" });

    expect(keys.keyFor(fingerprint)).toBe("key-1");
    expect(keys.keyFor(fingerprint)).toBe("key-1");
    keys.resolve(fingerprint);
    expect(keys.keyFor(fingerprint)).toBe("key-2");
  });

  it("does not retain a raw coupon code in the mutation fingerprint", () => {
    const rawCode = "CIVICKRW0123456789ABCDEF0123456789ABCDEF";
    const fingerprint = mutationFingerprint("/coupons/redeem", { rawCode });

    expect(fingerprint).not.toContain(rawCode);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("uses the Korean calendar day across the UTC day boundary", () => {
    expect(toKoreanCalendarDate(new Date("2026-08-31T15:30:00Z"))).toBe("2026-09-01");
  });
});
