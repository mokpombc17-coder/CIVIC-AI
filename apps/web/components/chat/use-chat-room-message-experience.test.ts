import { describe, expect, it } from "vitest";
import {
  collectConfirmedClientMessageIds,
  createChatRoomViewportKey,
} from "./use-chat-room-message-experience";

describe("ChatRoom message experience", () => {
  it("서버가 확정한 clientMessageId만 중복 없이 Outbox 확인 대상으로 만든다", () => {
    const clientMessageIds = collectConfirmedClientMessageIds([
      { clientMessageId: "client-message-a" },
      { clientMessageId: "client-message-b" },
      { clientMessageId: "client-message-a" },
    ]);

    expect([...clientMessageIds]).toEqual(["client-message-a", "client-message-b"]);
  });

  it("Room과 realtime generation을 message action viewport 경계로 묶는다", () => {
    expect(createChatRoomViewportKey("room-a", 3)).toBe("room-a:3");
    expect(createChatRoomViewportKey("room-b", 3)).toBe("room-b:3");
    expect(createChatRoomViewportKey("room-a", 4)).toBe("room-a:4");
  });
});
