import { describe, expect, it } from "vitest";
import type { RoomParticipationListItem } from "../chat-room-contracts";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  combineChatRoomSystemActivities,
  createChatRoomEventKey,
  createChatRoomSystemActivityMessage,
  createParticipationSystemActivities,
  filterChatRoomSystemActivitiesForCurrentParticipation,
  mergeChatRoomSystemActivities,
} from "./chat-room-system-activity";

describe("chat room system activity", () => {
  it("이벤트를 받은 시점의 마지막 확정 메시지 뒤에 참여 활동을 수신 순서대로 둔다", () => {
    const delivery = createDelivery([
      createMessageEvent(11, 1),
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-02", "participation-02", 2, "event-join"),
      createRoomEvent("ROOM_MEMBER_LEFT", "membership-03", "participation-03", 3, "event-left"),
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
        eventKey: "participation:participation-02:entered",
        kind: "joined",
        receivedOrder: 1,
        userLabel: "member-02",
      }),
      expect.objectContaining({
        afterMessageSequence: 11,
        eventKey: "participation:participation-03:ended",
        kind: "left",
        receivedOrder: 2,
        userLabel: "member-03",
      }),
    ]);
  });

  it("내 Membership 이벤트는 숨기고 같은 participation 활동 재전송은 한 번만 기록한다", () => {
    const firstDelivery = createDelivery([
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-01", "participation-01", 1, "event-self"),
      createRoomEvent("ROOM_MEMBER_JOINED", "membership-02", "participation-02", 2, "event-other"),
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

    expect(
      firstJournal?.activities.flatMap((activity) =>
        activity.kind === "room-closed" ? [] : [activity.membershipId],
      ),
    ).toEqual(["membership-02"]);
    expect(repeatedJournal).toBe(firstJournal);
  });

  it("eventId가 없으면 participation과 Membership/Room version으로 안정적인 키를 만든다", () => {
    const event = createRoomEvent(
      "ROOM_MEMBER_BANNED",
      "membership-02",
      "participation-02",
      1,
      undefined,
    ).event;
    const repeated = structuredClone(event);
    const nextParticipation = createRoomEvent(
      "ROOM_MEMBER_BANNED",
      "membership-02",
      "participation-03",
      1,
      undefined,
    ).event;

    expect(createChatRoomEventKey(repeated)).toBe(createChatRoomEventKey(event));
    expect(createChatRoomEventKey(nextParticipation)).not.toBe(createChatRoomEventKey(event));
  });

  it("participation 이력과 같은 WebSocket 활동은 REST의 정확한 위치로 한 번만 표시한다", () => {
    const restored = createParticipationSystemActivities(
      "room-01",
      [createParticipation("participation-02", "membership-02", 12)],
      "membership-01",
    );
    const realtime = [
      {
        ...restored[0]!,
        afterMessageSequence: 11,
        receivedOrder: 9,
      },
    ];

    expect(combineChatRoomSystemActivities(restored, realtime)).toEqual(restored);
  });

  it("같은 메시지 위치의 복원 활동은 API 배열 순서와 무관하게 발생 시각순으로 정렬한다", () => {
    const restored = createParticipationSystemActivities(
      "room-01",
      [
        {
          ...createParticipation("participation-new", "membership-new", 31),
          joinedAt: "2026-10-07T09:07:05.227Z",
        },
        {
          ...createParticipation("participation-old", "membership-old", 31),
          joinedAt: "2026-09-22T04:53:09.466Z",
        },
      ],
      null,
    );

    expect(
      combineChatRoomSystemActivities(restored, []).flatMap((activity) =>
        activity.kind === "room-closed" ? [] : [activity.membershipId],
      ),
    ).toEqual(["membership-old", "membership-new"]);
  });

  it("같은 Membership의 서로 다른 participation 입장과 종료 활동을 모두 유지한다", () => {
    const realtime = [
      createParticipantActivity("participation-01", "joined", "2026-10-07T09:07:01Z", 1),
      createParticipantActivity("participation-01", "left", "2026-10-07T09:07:02Z", 2),
      createParticipantActivity("participation-02", "joined", "2026-10-07T09:07:03Z", 3),
    ];

    expect(
      combineChatRoomSystemActivities([], realtime).map((activity) => activity.eventKey),
    ).toEqual([
      "participation:participation-01:entered",
      "participation:participation-01:ended",
      "participation:participation-02:entered",
    ]);
  });

  it("LEFT와 BANNED 종료를 복원하고 sequence가 없는 LEGACY 종료는 생략한다", () => {
    const activities = createParticipationSystemActivities(
      "room-01",
      [
        createEndedParticipation("participation-left", "membership-02", "LEFT", 10, 20),
        createEndedParticipation("participation-banned", "membership-03", "BANNED", 11, 21),
        {
          ...createEndedParticipation("participation-legacy", "membership-04", "LEFT", 12, 22),
          endedAfterMessageSequence: null,
          origin: "LEGACY",
        },
      ],
      null,
      new Map([["membership-02", "member-02"]]),
    );

    expect(activities.map(({ kind }) => kind)).toEqual([
      "joined",
      "left",
      "joined",
      "banned",
      "joined",
    ]);
    expect(activities[0]).toMatchObject({ userLabel: "member-02" });
    expect(activities[1]).toMatchObject({ userLabel: "member-02" });
    expect(activities[2]).toMatchObject({ userLabel: "membership-03" });
  });

  it("현재 참여가 시작된 뒤 발생한 입장과 퇴장 안내만 표시한다", () => {
    const activities = [
      createParticipantActivity("participation-before", "joined", "2026-10-07T09:59:00Z", 1),
      createParticipantActivity("participation-before", "left", "2026-10-07T10:01:00Z", 2),
      createParticipantActivity("participation-after", "joined", "2026-10-07T10:02:00Z", 3),
    ];
    const selfParticipation = {
      ...createParticipation("participation-self", "membership-self", 31),
      joinedAt: "2026-10-07T10:00:00Z",
    };

    expect(
      filterChatRoomSystemActivitiesForCurrentParticipation(
        activities,
        [selfParticipation],
        "membership-self",
      ).map(({ eventKey }) => eventKey),
    ).toEqual([
      "participation:participation-before:ended",
      "participation:participation-after:entered",
    ]);
  });

  it("ROOM_CLOSED participation이 여러 개여도 방 종료 안내를 한 번만 복원한다", () => {
    const activities = createParticipationSystemActivities(
      "room-01",
      [
        createEndedParticipation("participation-01", "membership-01", "ROOM_CLOSED", 10, 30),
        createEndedParticipation("participation-02", "membership-02", "ROOM_CLOSED", 20, 30),
      ],
      null,
    );
    const roomClosedActivities = activities.filter(({ kind }) => kind === "room-closed");

    expect(roomClosedActivities).toEqual([
      expect.objectContaining({
        afterMessageSequence: 30,
        eventKey: "room:room-01:closed",
        kind: "room-closed",
      }),
    ]);
    expect(createChatRoomSystemActivityMessage(roomClosedActivities[0]!)).toBe(
      "토론방이 종료되었습니다.",
    );
  });

  it("실시간 ROOM_CLOSED 이벤트를 참여자 수와 무관한 방 단위 안내로 한 번만 기록한다", () => {
    const roomClosedEvent = createRoomClosedEvent(1, "event-room-closed");
    const journal = mergeChatRoomSystemActivities({
      delivery: createDelivery([roomClosedEvent, { ...roomClosedEvent, bufferSequence: 2 }]),
      initialLatestMessageSequence: 30,
      journal: undefined,
      messageVisibleAfterSequence: 0,
      selfMembershipId: "membership-01",
    });

    expect(journal?.activities).toEqual([
      expect.objectContaining({
        afterMessageSequence: 30,
        eventKey: "room:room-01:closed",
        kind: "room-closed",
      }),
    ]);
  });

  it("userLabel이 없으면 참여자 이름, 이후 일반 문구 순으로 fallback한다", () => {
    const activity = createParticipantActivity(
      "participation-02",
      "left",
      "2026-09-01T00:00:00Z",
      1,
      null,
    );

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
        senderParticipationId: "participation-01",
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
  participationId: string,
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
          participationId,
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

function createRoomClosedEvent(
  bufferSequence: number,
  eventId: string,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "room" }> {
  return {
    bufferSequence,
    kind: "room",
    event: {
      eventId,
      eventType: "ROOM_CLOSED",
      eventVersion: 2,
      emittedAt: "2026-09-01T00:10:00Z",
      payload: {
        owner: {
          membershipId: "membership-01",
          membershipVersion: 2,
          participationId: "participation-01",
          role: "OWNER",
          status: "LEFT",
          userLabel: "owner",
        },
        roomId: "room-01",
        roomStatus: "CLOSED",
        roomVersion: 2,
      },
    },
  };
}

function createParticipation(
  participationId: string,
  membershipId: string,
  enteredAfterMessageSequence: number,
): RoomParticipationListItem {
  return {
    displayName: membershipId,
    endedAfterMessageSequence: null,
    endedAt: null,
    endReason: null,
    enteredAfterMessageSequence,
    imageUrl: null,
    joinedAt: "2026-09-01T00:00:00Z",
    membershipId,
    origin: "NORMAL",
    participationId,
    profileVersion: 1,
    status: "ACTIVE",
    version: 1,
  };
}

function createEndedParticipation(
  participationId: string,
  membershipId: string,
  endReason: "LEFT" | "BANNED" | "ROOM_CLOSED",
  enteredAfterMessageSequence: number,
  endedAfterMessageSequence: number,
): RoomParticipationListItem {
  return {
    ...createParticipation(participationId, membershipId, enteredAfterMessageSequence),
    endedAfterMessageSequence,
    endedAt: "2026-09-01T00:10:00Z",
    endReason,
    status: "ENDED",
  };
}

function createParticipantActivity(
  participationId: string,
  kind: "joined" | "left" | "banned",
  emittedAt: string,
  receivedOrder: number,
  userLabel: string | null = "철수",
) {
  return {
    afterMessageSequence: 31,
    emittedAt,
    eventKey: `participation:${participationId}:${kind === "joined" ? "entered" : "ended"}`,
    kind,
    membershipId: "membership-02",
    participationId,
    receivedOrder,
    userLabel,
  } as const;
}
