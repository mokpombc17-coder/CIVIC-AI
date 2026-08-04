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
      "SUBSCRIBE /user/queue/room-inbox-events",
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

  it("활성 방 topic만 정해진 순서로 다시 구독한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    manager.connect();
    manager.activateRoom("room-01");
    client.frames.length = 0;

    manager.resubscribeRoom("room-01");

    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
    ]);
  });

  it("활성 방 메시지를 command destination으로 publish한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);
    const request = {
      clientMessageId: REQUEST_ID,
      content: "안녕하세요.",
    };

    manager.connect();
    manager.activateRoom("room-01");
    manager.sendRoomMessage("room-01", request);

    expect(client.publish).toHaveBeenLastCalledWith({
      destination: "/app/rooms/room-01/messages",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
  });

  it("활성 방 메시지 수정·삭제를 전용 command destination으로 publish한다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);
    const editRequest = {
      clientMutationId: REQUEST_ID,
      messageId: "message-01",
      content: "  수정된 메시지  ",
    };
    const deleteRequest = {
      clientMutationId: "550e8400-e29b-41d4-a716-446655440001",
      messageId: "message-01",
    };

    manager.connect();
    manager.activateRoom("room-01");
    manager.editRoomMessage("room-01", editRequest);
    manager.deleteRoomMessage("room-01", deleteRequest);

    expect(client.publish).toHaveBeenNthCalledWith(1, {
      destination: "/app/rooms/room-01/messages/edit",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...editRequest,
        content: "수정된 메시지",
      }),
    });
    expect(client.publish).toHaveBeenNthCalledWith(2, {
      destination: "/app/rooms/room-01/messages/delete",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(deleteRequest),
    });
  });

  it("활성 방이 아니거나 payload가 유효하지 않으면 메시지를 publish하지 않는다", () => {
    const client = createFakeClient();
    const manager = new ChatStompSubscriptionManager(client);

    manager.connect();
    manager.activateRoom("room-01");

    expect(() =>
      manager.sendRoomMessage("room-02", {
        clientMessageId: REQUEST_ID,
        content: "다른 방 메시지",
      }),
    ).toThrow("활성 방의 STOMP topic 구독이 준비되지 않았습니다.");
    expect(() =>
      manager.sendRoomMessage("room-01", {
        clientMessageId: "not-a-uuid",
        content: "잘못된 요청",
      }),
    ).toThrow();
    expect(() =>
      manager.editRoomMessage("room-02", {
        clientMutationId: REQUEST_ID,
        messageId: "message-01",
        content: "수정",
      }),
    ).toThrow("활성 방의 STOMP topic 구독이 준비되지 않았습니다.");
    expect(() =>
      manager.deleteRoomMessage("room-01", {
        clientMutationId: "not-a-uuid",
        messageId: "message-01",
      }),
    ).toThrow();
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
