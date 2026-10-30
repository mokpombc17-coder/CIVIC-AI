import { describe, expect, it } from "vitest";
import { createChatMessageTimeline, createChatMessageTimelineRows } from "./chat-message-timeline";
import type { ChatMessage } from "./chat-room-contracts";
import type { ChatOutgoingMessage } from "./realtime/chat-message-outbox";
import { combineChatRoomSystemActivities } from "./realtime/chat-room-system-activity";

const CLIENT_MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createChatMessageTimeline", () => {
  it("확정 메시지 뒤에 optimistic 메시지를 전송 요청 순서대로 표시한다", () => {
    const timeline = createChatMessageTimeline(
      [createConfirmed("server-id")],
      [createOutgoing(CLIENT_MESSAGE_ID, "queued")],
    );

    expect(timeline.map(({ kind }) => kind)).toEqual(["confirmed", "outgoing"]);
  });

  it("같은 clientMessageId가 서버 이력에 나타나면 optimistic 항목을 제거한다", () => {
    const timeline = createChatMessageTimeline(
      [createConfirmed(CLIENT_MESSAGE_ID)],
      [createOutgoing(CLIENT_MESSAGE_ID, "accepted")],
    );

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe("confirmed");
  });
});

describe("createChatMessageTimelineRows", () => {
  it("Asia/Seoul 달력 날짜가 바뀌는 첫 메시지 앞에 날짜 구분선을 넣는다", () => {
    const timeline = createChatMessageTimeline(
      [
        createConfirmed("before-midnight", "2026-08-06T14:59:59Z"),
        createConfirmed("after-midnight", "2026-08-06T15:00:00Z"),
      ],
      [],
    );

    const rows = createChatMessageTimelineRows(timeline);

    expect(rows.map(({ kind }) => kind)).toEqual([
      "date-separator",
      "message",
      "date-separator",
      "message",
    ]);
    expect(rows.filter((row) => row.kind === "date-separator")).toEqual([
      {
        date: { day: 6, key: "2026-08-06", month: 8, year: 2026 },
        kind: "date-separator",
        renderKey: "date-separator-2026-08-06-before-message-before-midnight",
      },
      {
        date: { day: 7, key: "2026-08-07", month: 8, year: 2026 },
        kind: "date-separator",
        renderKey: "date-separator-2026-08-07-before-message-after-midnight",
      },
    ]);
  });

  it("과거 페이지가 같은 날짜에 합쳐져도 날짜 구분선을 중복 생성하지 않는다", () => {
    const timeline = createChatMessageTimeline(
      [
        createConfirmed("older", "2026-08-06T01:00:00Z"),
        createConfirmed("newer", "2026-08-06T14:59:59Z"),
      ],
      [],
    );

    const rows = createChatMessageTimelineRows(timeline);

    expect(rows.filter((row) => row.kind === "date-separator")).toHaveLength(1);
    expect(rows.map(({ kind }) => kind)).toEqual(["date-separator", "message", "message"]);
  });

  it("optimistic 메시지는 enqueuedAt의 날짜로 기존 메시지 뒤에 그룹화한다", () => {
    const timeline = createChatMessageTimeline(
      [createConfirmed("confirmed", "2026-08-06T14:00:00Z")],
      [
        createOutgoing("same-day", "queued", Date.parse("2026-08-06T14:30:00Z")),
        createOutgoing("next-day", "sending", Date.parse("2026-08-06T15:00:00Z")),
      ],
    );

    const rows = createChatMessageTimelineRows(timeline);

    expect(rows.filter((row) => row.kind === "date-separator").map((row) => row.date.key)).toEqual([
      "2026-08-06",
      "2026-08-07",
    ]);
    expect(rows.map(({ kind }) => kind)).toEqual([
      "date-separator",
      "message",
      "message",
      "date-separator",
      "message",
    ]);
  });

  it("같은 날짜가 떨어져 다시 등장해도 날짜 구분선 renderKey를 고유하게 유지한다", () => {
    const timeline = createChatMessageTimeline(
      [
        createConfirmed("first-day", "2026-08-24T15:00:00Z"),
        createConfirmed("second-day", "2026-08-25T15:00:00Z"),
      ],
      [createOutgoing("optimistic-first-day", "queued", Date.parse("2026-08-24T16:00:00Z"))],
    );

    const separatorKeys = createChatMessageTimelineRows(timeline).flatMap((row) =>
      row.kind === "date-separator" ? [row.renderKey] : [],
    );

    expect(separatorKeys).toEqual([
      "date-separator-2026-08-25-before-message-first-day",
      "date-separator-2026-08-26-before-message-second-day",
      "date-separator-2026-08-25-before-message-optimistic-first-day",
    ]);
    expect(new Set(separatorKeys).size).toBe(separatorKeys.length);
  });

  it("삭제된 메시지도 updatedAt이 아닌 원래 createdAt 날짜를 유지한다", () => {
    const timeline = createChatMessageTimeline(
      [createDeletedConfirmed("deleted", "2026-08-05T15:00:00Z", "2026-08-07T15:00:00Z")],
      [],
    );

    const rows = createChatMessageTimelineRows(timeline);

    expect(rows[0]).toMatchObject({
      date: { key: "2026-08-06" },
      kind: "date-separator",
    });
  });

  it("날짜 구분선 뒤이자 첫 안 읽은 확정 메시지 앞에 읽음 경계를 한 번 넣는다", () => {
    const timeline = createChatMessageTimeline(
      [
        { ...createConfirmed("read", "2026-08-06T14:59:59Z"), roomSequence: 130 },
        { ...createConfirmed("unread", "2026-08-06T15:00:00Z"), roomSequence: 131 },
        { ...createConfirmed("newer", "2026-08-06T15:01:00Z"), roomSequence: 132 },
      ],
      [],
    );

    const rows = createChatMessageTimelineRows(timeline, {
      readBoundaryAfterSequence: 130,
    });

    expect(rows.map(({ kind }) => kind)).toEqual([
      "date-separator",
      "message",
      "date-separator",
      "read-boundary",
      "message",
      "message",
    ]);
    expect(rows.filter((row) => row.kind === "read-boundary")).toEqual([
      {
        afterSequence: 130,
        kind: "read-boundary",
        renderKey: "read-boundary-130",
      },
    ]);
  });

  it("삭제된 확정 메시지도 sequence 기준 첫 안 읽은 메시지로 취급한다", () => {
    const timeline = createChatMessageTimeline(
      [
        { ...createConfirmed("read"), roomSequence: 10 },
        {
          ...createDeletedConfirmed("deleted", "2026-07-31T00:01:00Z", "2026-08-01T00:00:00Z"),
          roomSequence: 11,
        },
      ],
      [],
    );

    expect(
      createChatMessageTimelineRows(timeline, { readBoundaryAfterSequence: 10 }).map(
        ({ kind }) => kind,
      ),
    ).toEqual(["date-separator", "message", "read-boundary", "message"]);
  });

  it("경계 뒤에 optimistic 메시지만 있으면 읽음 경계를 만들지 않는다", () => {
    const timeline = createChatMessageTimeline(
      [{ ...createConfirmed("read"), roomSequence: 10 }],
      [createOutgoing("optimistic", "queued")],
    );

    expect(
      createChatMessageTimelineRows(timeline, { readBoundaryAfterSequence: 10 }).some(
        (row) => row.kind === "read-boundary",
      ),
    ).toBe(false);
  });

  it("유효하지 않은 읽음 경계 sequence를 거절한다", () => {
    expect(() => createChatMessageTimelineRows([], { readBoundaryAfterSequence: -1 })).toThrowError(
      RangeError,
    );
    expect(() =>
      createChatMessageTimelineRows([], { readBoundaryAfterSequence: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrowError(RangeError);
  });

  it("유효하지 않은 내부 timestamp는 조용히 잘못된 날짜로 표시하지 않는다", () => {
    const timeline = createChatMessageTimeline(
      [],
      [createOutgoing("invalid-date", "queued", Number.NaN)],
    );

    expect(() => createChatMessageTimelineRows(timeline)).toThrowError(RangeError);
  });

  it("시스템 활동을 지정된 확정 메시지 뒤에 두고 optimistic 메시지보다 앞에 표시한다", () => {
    const timeline = createChatMessageTimeline(
      [{ ...createConfirmed("confirmed"), roomSequence: 12 }],
      [createOutgoing("optimistic", "queued", Date.parse("2026-07-31T00:00:02Z"))],
    );
    const rows = createChatMessageTimelineRows(timeline, {
      systemActivities: [
        {
          afterMessageSequence: 12,
          emittedAt: "2026-07-31T00:00:01Z",
          eventKey: "event-join",
          kind: "joined",
          membershipId: "membership-02",
          participationId: "participation-02",
          receivedOrder: 1,
          userLabel: "철수",
        },
      ],
    });

    expect(rows.map(({ kind }) => kind)).toEqual([
      "date-separator",
      "message",
      "system-activity",
      "message",
    ]);
  });

  it("아직 불러오지 않은 sequence의 시스템 활동은 anchor 메시지가 나타날 때까지 숨긴다", () => {
    const timeline = createChatMessageTimeline(
      [{ ...createConfirmed("confirmed"), roomSequence: 12 }],
      [],
    );
    const rows = createChatMessageTimelineRows(timeline, {
      systemActivities: [
        {
          afterMessageSequence: 5,
          emittedAt: "2026-07-31T00:00:01Z",
          eventKey: "event-old",
          kind: "left",
          membershipId: "membership-02",
          participationId: "participation-02",
          receivedOrder: 1,
          userLabel: "철수",
        },
      ],
    });

    expect(rows.some((row) => row.kind === "system-activity")).toBe(false);
  });

  it("표시 가능한 메시지가 없으면 현재 사용자의 시작 경계 뒤 활동을 첫 항목으로 표시한다", () => {
    const rows = createChatMessageTimelineRows([], {
      systemActivityStartAfterSequence: 100,
      systemActivities: [
        {
          afterMessageSequence: 100,
          emittedAt: "2026-07-31T00:00:01Z",
          eventKey: "event-first",
          kind: "joined",
          membershipId: "membership-02",
          participationId: "participation-02",
          receivedOrder: 1,
          userLabel: "철수",
        },
      ],
    });

    expect(rows.map(({ kind }) => kind)).toEqual(["date-separator", "system-activity"]);
  });

  it("같은 위치의 과거 입장과 오늘 입장을 시간순으로 표시해 오늘 구분선을 중복하지 않는다", () => {
    const timeline = createChatMessageTimeline(
      [{ ...createConfirmed("today", "2026-10-07T09:08:00Z"), roomSequence: 32 }],
      [],
    );
    const systemActivities = combineChatRoomSystemActivities(
      [
        {
          afterMessageSequence: 31,
          emittedAt: "2026-10-07T09:07:05.227Z",
          eventKey: "membership-entry:new:31",
          kind: "joined",
          membershipId: "membership-new",
          participationId: "participation-new",
          receivedOrder: 0,
          userLabel: "새 참여자",
        },
        {
          afterMessageSequence: 31,
          emittedAt: "2026-09-22T04:53:09.466Z",
          eventKey: "membership-entry:old:31",
          kind: "joined",
          membershipId: "membership-old",
          participationId: "participation-old",
          receivedOrder: 1,
          userLabel: "기존 참여자",
        },
      ],
      [],
    );
    const rows = createChatMessageTimelineRows(timeline, {
      systemActivities,
      systemActivityStartAfterSequence: 31,
    });

    expect(rows.flatMap((row) => (row.kind === "date-separator" ? [row.date.key] : []))).toEqual([
      "2026-09-22",
      "2026-10-07",
    ]);
    expect(
      rows.flatMap((row) =>
        row.kind === "system-activity" && row.activity.kind !== "room-closed"
          ? [row.activity.membershipId]
          : [],
      ),
    ).toEqual(["membership-old", "membership-new"]);
  });
});

function createConfirmed(clientMessageId: string, createdAt = "2026-07-31T00:00:00Z"): ChatMessage {
  return {
    messageId: "message-01",
    roomId: "room-01",
    roomSequence: 1,
    countable: true,
    senderMembershipId: "membership-01",
    senderParticipationId: "participation-01",
    clientMessageId,
    content: "확정 메시지",
    createdAt,
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: createdAt,
  };
}

function createDeletedConfirmed(
  clientMessageId: string,
  createdAt: string,
  updatedAt: string,
): ChatMessage {
  return {
    messageId: "message-deleted",
    roomId: "room-01",
    roomSequence: 2,
    countable: true,
    senderMembershipId: "membership-01",
    senderParticipationId: "participation-fixture",
    clientMessageId,
    content: null,
    createdAt,
    deletedAt: updatedAt,
    messageVersion: 2,
    state: "DELETED_BY_AUTHOR",
    updatedAt,
  };
}

function createOutgoing(
  clientMessageId: string,
  status: ChatOutgoingMessage["status"],
  enqueuedAt = 1_000,
): ChatOutgoingMessage {
  return {
    attempt: status === "queued" ? 0 : 1,
    clientMessageId,
    content: "optimistic 메시지",
    enqueuedAt,
    generation: 3,
    message: null,
    retryAt: null,
    roomId: "room-01",
    status,
  };
}
