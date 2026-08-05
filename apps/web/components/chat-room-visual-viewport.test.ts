import { describe, expect, it } from "vitest";
import { calculateChatRoomVisibleHeight } from "./chat-room-visual-viewport";

describe("calculateChatRoomVisibleHeight", () => {
  it("reserves a bottom gap from the visual viewport height", () => {
    expect(
      calculateChatRoomVisibleHeight({
        bottomGap: 16,
        viewportHeight: 800,
      }),
    ).toBe(784);
  });

  it("never returns a negative height", () => {
    expect(
      calculateChatRoomVisibleHeight({
        bottomGap: 16,
        viewportHeight: 10,
      }),
    ).toBe(0);
  });
});
