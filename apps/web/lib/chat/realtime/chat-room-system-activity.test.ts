import { describe, expect, it } from "vitest";
import type { RoomMembershipListItem } from "../chat-room-contracts";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  combineChatRoomSystemActivities,
  createChatRoomEventKey,
  createChatRoomSystemActivityMessage,
  createMembershipEntrySystemActivities,
  mergeChatRoomSystemActivities,
} from "./chat-room-system-activity";

describe("chat room system activity", () => {
  it("이벤트를 받은 시점의 마지막 확정 메시지 뒤에 참여 활동을 수신 순서대로 둔다", () => {
    const delivery = createDelivery([
      createMessageEvent(11, 1),
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-02", 2, "event-join"),
      createRoomEvent("ROOM_MEMBER_LEFT", "membership-03", 3, "event-left"),
    ]);

    const journal = mergeChatRoomSystemActivities({
      delivery,
      initialLatestMessageSequence: 10,
      journal: undefined,
      messageVisibleAfterSequence: 0,
      participantDisplayNames: new Map(),
      selfMembershipId: "membership-01",
    });

    expect(journal?.activities).toEqual([
      expect.objectContaining({
        afterMessageSequence: 11,
        eventKey: "event-join",
        kind: "joined",
        receivedOrder: 1,
        userLabel: "member-02",
      }),
      expect.objectContaining({
        afterMessageSequence: 11,
        eventKey: "event-left",
        kind: "left",
        receivedOrder: 2,
        userLabel: "member-03",
      }),
    ]);
  });

  it("내 Membership 이벤트는 숨기고 같은 이벤트 재전송은 한 번만 기록한다", () => {
    const firstDelivery = createDelivery([
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-01", 1, "event-self"),
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-02", 2, "event-other"),
    ]);
    const firstJournal = mergeChatRoomSystemActivities({
      delivery: firstDelivery,
      initialLatestMessageSequence: 7,
      journal: undefined,
      messageVisibleAfterSequence: 0,
      selfMembershipId: "membership-01",
    });
    const repeatedJournal = mergeChatRoomSystemActivities({
      delivery: firstDelivery,
      initialLatestMessageSequence: 7,
      journal: firstJournal,
      messageVisibleAfterSequence: 0,
      selfMembershipId: "membership-01",
    });

    expect(firstJournal?.activities.map((activity) => activity.membershipId)).toEqual([
      "membership-02",
    ]);
    expect(repeatedJournal).toBe(firstJournal);
  });

  it("eventId가 없으면 이벤트 종류와 Membership/Room version으로 안정적인 키를 만든다", () => {
    const event = createRoomEvent("ROOM_MEMBER_BANNED", "membership-02", 1, undefined).event;
    const repeated = structuredClone(event);
    const nextVersion = createRoomEvent("ROOM_MEMBER_BANNED", "membership-02", 2, undefined).event;

    expect(createChatRoomEventKey(repeated)).toBe(createChatRoomEventKey(event));
    expect(createChatRoomEventKey(nextVersion)).not.toBe(createChatRoomEventKey(event));
  });

  it("참여자 목록의 입장 위치를 복원하고 같은 WebSocket 입장 활동과 중복 표시하지 않는다", () => {
    const restored = createMembershipEntrySystemActivities(
      [createMembership("membership-01", 0), createMembership("membership-02", 12)],
      "membership-01",
    );
    const realtime = [
      {
        ...restored[0]!,
        eventKey: "event-join",
        receivedOrder: 9,
        userLabel: "realtime-label",
      },
    ];

    expect(combineChatRoomSystemActivities(restored, realtime)).toEqual(realtime);
  });

  it("userLabel이 없으면 참여자 이름, 이후 일반 문구 순으로 fallback한다", () => {
    const activity = {
      afterMessageSequence: 3,
      emittedAt: "2026-09-01T00:00:00Z",
      eventKey: "event-left",
      kind: "left" as const,
      membershipId: "membership-02",
      receivedOrder: 1,
      userLabel: null,
    };

    expect(
      createChatRoomSystemActivityMessage(activity, new Map([["membership-02", "철수"]])),
    ).toBe("철수님이 퇴장했습니다.");
    expect(createChatRoomSystemActivityMessage(activity)).toBe("참여자님이 퇴장했습니다.");
    expect(createChatRoomSystemActivityMessage({ ...activity, kind: "banned" })).toBe(
      "참여자님을 내보냈습니다.",
    );
  });
});

function createDelivery(events: ChatRealtimeEventDelivery["events"]): ChatRealtimeEventDelivery {
  return {
    deliveryId: "delivery-01",
    events,
    generation: 1,
    invalidEventCount: 0,
    invalidReadReceiptEventCount: 0,
    overflowed: false,
    roomId: "room-01",
    throughBufferSequence: events.at(-1)?.bufferSequence ?? 0,
  };
}

function createMessageEvent(
  roomSequence: number,
  bufferSequence: number,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "message" }> {
  const createdAt = "2026-09-01T00:00:00Z";
  return {
    bufferSequence,
    kind: "message",
    event: {
      eventType: "CHAT_MESSAGE_CREATED",
      eventVersion: 2,
      payload: {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
        content: "메시지",
        countable: true,
        createdAt,
        deletedAt: null,
        messageId: `message-${roomSequence}`,
        messageVersion: 1,
        roomId: "room-01",
        roomSequence,
        senderMembershipId: "membership-01",
        state: "ACTIVE",
        updatedAt: createdAt,
      },
    },
  };
}

function createRoomEvent(
  eventType:
    "ROOM_MEMBER_JOINED" | "ROOM_MEMBER_REJOINED" | "ROOM_MEMBER_LEFT" | "ROOM_MEMBER_BANNED",
  membershipId: string,
  bufferSequence: number,
  eventId: string | undefined,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "room" }> {
  return {
    bufferSequence,
    kind: "room",
    event: {
      eventId,
      eventType,
      eventVersion: 2,
      emittedAt: "2026-09-01T00:00:00Z",
      payload: {
        member: {
          membershipId,
          membershipVersion: bufferSequence,
          role: "MEMBER",
          status: eventType === "ROOM_MEMBER_BANNED" ? "BANNED" : "ACTIVE",
          userLabel: membershipId.replace("membership", "member"),
        },
        roomId: "room-01",
        roomStatus: "ACTIVE",
        roomVersion: bufferSequence,
      },
    },
  };
}

function createMembership(
  membershipId: string,
  enteredAfterMessageSequence: number,
): RoomMembershipListItem {
  return {
    bannedAt: null,
    displayName: "참여자",
    enteredAfterMessageSequence,
    imageUrl: null,
    joinedAt: "2026-09-01T00:00:00Z",
    leftAt: null,
    membershipId,
    profileVersion: 1,
    role: "MEMBER",
    status: "ACTIVE",
    userLabel: membershipId,
    version: 1,
  };
}
