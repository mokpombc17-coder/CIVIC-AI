import type { IPublishParams, StompSubscription } from "@stomp/stompjs";
import { describe, expect, it, vi } from "vitest";
import {
  ChatStompSubscriptionManager,
  type ChatStompSubscriptionClient,
} from "./chat-stomp-subscription-manager";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("ChatStompSubscriptionManager", () => {
  it("공통 queue와 방 topic 이후 sync 요청을 정확한 순서로 publish한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    manager.connect();
    manager.activateRoom("room-01");
    manager.syncRoomSubscriptions("room-01", REQUEST_ID);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
    expect(client.publish).toHaveBeenCalledWith({
      destination: "/app/rooms/room-01/subscriptions/sync",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestId: REQUEST_ID }),
    });
  });

  it("연결되지 않았거나 방 topic이 없는 상태에서는 sync를 보내지 않는다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    expect(() => manager.syncRoomSubscriptions("room-01", REQUEST_ID)).toThrow(
      "활성 방의 STOMP topic 구독이 준비되지 않았습니다.",
    );

    manager.connect();

    expect(() => manager.syncRoomSubscriptions("room-01", REQUEST_ID)).toThrow(
      "활성 방의 STOMP topic 구독이 준비되지 않았습니다.",
    );
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("현재 활성 방이 아닌 방의 sync 요청을 거절한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    manager.connect();
    manager.activateRoom("room-01");

    expect(() => manager.syncRoomSubscriptions("room-02", REQUEST_ID)).toThrow(
      "활성 방의 STOMP topic 구독이 준비되지 않았습니다.",
    );
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("유효하지 않은 requestId를 publish 전에 거절한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    manager.connect();
    manager.activateRoom("room-01");

    expect(() => manager.syncRoomSubscriptions("room-01", "not-a-uuid")).toThrow();
    expect(client.publish).not.toHaveBeenCalled();
  });
});

type FakeStompClient = ChatStompSubscriptionClient & {
  frames: string[];
  publish: ReturnType<typeof vi.fn<(params: IPublishParams) => void>>;
};

function createFakeClient(): FakeStompClient {
  let nextSubscriptionId = 1;
  const frames: string[] = [];

  return {
    frames,
    publish: vi.fn((params: IPublishParams) => {
      frames.push(`SEND ${params.destination}`);
    }),
    subscribe: vi.fn((destination: string) => {
      const id = `subscription-${nextSubscriptionId++}`;
      frames.push(`SUBSCRIBE ${destination}`);

      return {
        id,
        unsubscribe() {
          frames.push(`UNSUBSCRIBE ${destination}`);
        },
      } satisfies StompSubscription;
    }),
  };
}
