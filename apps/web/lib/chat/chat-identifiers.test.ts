import { describe, expect, it, vi } from "vitest";
import { createClientMessageId, createIdempotencyKey } from "./chat-identifiers";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("chat identifiers", () => {
  it("Idempotency-Key에 사용할 UUID v4를 생성한다", () => {
    expect(createIdempotencyKey()).toMatch(UUID_V4_PATTERN);
  });

  it("STOMP clientMessageId에 사용할 UUID v4를 생성한다", () => {
    expect(createClientMessageId()).toMatch(UUID_V4_PATTERN);
  });

  it("테스트와 호출 수명 제어를 위해 UUID 생성기를 주입할 수 있다", () => {
    const fixedUuid = "07af9111-3e20-43e5-ae80-78d1bf547647";
    const generateUuid = vi.fn(() => fixedUuid);

    expect(createIdempotencyKey(generateUuid)).toBe(fixedUuid);
    expect(createClientMessageId(generateUuid)).toBe(fixedUuid);
    expect(generateUuid).toHaveBeenCalledTimes(2);
  });
});
