import { describe, expect, it } from "vitest";
import {
  CHAT_COMMAND_RESULTS_DESTINATION,
  CHAT_SYSTEM_EVENTS_DESTINATION,
  getChatRoomEventsDestination,
  getChatRoomMessageSendDestination,
  getChatRoomMessagesDestination,
  getChatRoomSubscriptionSyncDestination,
} from "./chat-stomp-destinations";

describe("chat STOMP destinations", () => {
  it("사용자 공통 queue destination을 제공한다", () => {
    expect(CHAT_SYSTEM_EVENTS_DESTINATION).toBe("/user/queue/system-events");
    expect(CHAT_COMMAND_RESULTS_DESTINATION).toBe("/user/queue/command-results");
  });

  it("방 단위 topic destination을 생성한다", () => {
    expect(getChatRoomMessagesDestination("room-01")).toBe("/topic/rooms/room-01/messages");
    expect(getChatRoomEventsDestination("room-01")).toBe("/topic/rooms/room-01/room-events");
  });

  it("방 단위 SEND destination을 생성한다", () => {
    expect(getChatRoomMessageSendDestination("room-01")).toBe("/app/rooms/room-01/messages");
    expect(getChatRoomSubscriptionSyncDestination("room-01")).toBe(
      "/app/rooms/room-01/subscriptions/sync",
    );
  });
});
