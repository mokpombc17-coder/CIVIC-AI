import type { ChatMessage } from "./chat-room-contracts";
import type { ChatOutgoingMessage } from "./realtime/chat-message-outbox";
import type { ChatRoomSystemActivity } from "./realtime/chat-room-system-activity";

const CHAT_MESSAGE_DATE_TIME_ZONE = "Asia/Seoul";
const CHAT_MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: CHAT_MESSAGE_DATE_TIME_ZONE,
  year: "numeric",
});

export type ChatMessageTimelineItem =
  | Readonly<{
      kind: "confirmed";
      message: ChatMessage;
    }>
  | Readonly<{
      kind: "outgoing";
      message: ChatOutgoingMessage;
    }>;

export type ChatMessageTimelineDate = Readonly<{
  day: number;
  key: string;
  month: number;
  year: number;
}>;

export type ChatMessageTimelineRow =
  | Readonly<{
      date: ChatMessageTimelineDate;
      kind: "date-separator";
      renderKey: string;
    }>
  | Readonly<{
      afterSequence: number;
      kind: "read-boundary";
      renderKey: string;
    }>
  | Readonly<{
      activity: ChatRoomSystemActivity;
      kind: "system-activity";
      renderKey: string;
    }>
  | Readonly<{
      item: ChatMessageTimelineItem;
      kind: "message";
    }>;

export type CreateChatMessageTimelineRowsOptions = Readonly<{
  readBoundaryAfterSequence?: number | null;
  systemActivityStartAfterSequence?: number;
  systemActivities?: readonly ChatRoomSystemActivity[];
}>;

export function createChatMessageTimeline(
  confirmedMessages: readonly ChatMessage[],
  outgoingMessages: readonly ChatOutgoingMessage[],
): readonly ChatMessageTimelineItem[] {
  const confirmedClientMessageIds = new Set(
    confirmedMessages.map((message) => message.clientMessageId),
  );
  const confirmedItems: ChatMessageTimelineItem[] = confirmedMessages.map((message) => ({
    kind: "confirmed",
    message,
  }));
  const outgoingItems: ChatMessageTimelineItem[] = outgoingMessages
    .filter((message) => !confirmedClientMessageIds.has(message.clientMessageId))
    .map((message) => ({
      kind: "outgoing",
      message,
    }));

  return Object.freeze([...confirmedItems, ...outgoingItems]);
}

export function createChatMessageTimelineRows(
  timeline: readonly ChatMessageTimelineItem[],
  {
    readBoundaryAfterSequence = null,
    systemActivityStartAfterSequence = 0,
    systemActivities = [],
  }: CreateChatMessageTimelineRowsOptions = {},
): readonly ChatMessageTimelineRow[] {
  if (
    readBoundaryAfterSequence !== null &&
    (!Number.isSafeInteger(readBoundaryAfterSequence) || readBoundaryAfterSequence < 0)
  ) {
    throw new RangeError("읽음 구분선 sequence는 0 이상의 안전한 정수여야 합니다.");
  }

  const rows: ChatMessageTimelineRow[] = [];
  let previousDateKey: string | null = null;
  let readBoundaryInserted = false;
  const confirmedSequences = new Set(
    timeline.flatMap((item) => (item.kind === "confirmed" ? [item.message.roomSequence] : [])),
  );
  const visibleActivities = systemActivities.filter(
    (activity) =>
      activity.afterMessageSequence === systemActivityStartAfterSequence ||
      confirmedSequences.has(activity.afterMessageSequence),
  );
  const activitiesBySequence = new Map<number, ChatRoomSystemActivity[]>();

  for (const activity of visibleActivities) {
    const activities = activitiesBySequence.get(activity.afterMessageSequence) ?? [];
    activities.push(activity);
    activitiesBySequence.set(activity.afterMessageSequence, activities);
  }

  const appendDateSeparator = (date: ChatMessageTimelineDate, anchorKey: string) => {
    if (date.key === previousDateKey) {
      return;
    }

    rows.push(
      Object.freeze({
        date,
        kind: "date-separator",
        renderKey: `date-separator-${date.key}-before-${anchorKey}`,
      }),
    );
    previousDateKey = date.key;
  };

  const appendActivitiesAfterSequence = (afterMessageSequence: number) => {
    for (const activity of activitiesBySequence.get(afterMessageSequence) ?? []) {
      const activityRenderKey = `system-activity-${activity.eventKey}`;
      appendDateSeparator(
        getChatMessageTimelineDateFromTimestamp(activity.emittedAt),
        activityRenderKey,
      );
      rows.push(
        Object.freeze({
          activity,
          kind: "system-activity",
          renderKey: activityRenderKey,
        }),
      );
    }
  };

  appendActivitiesAfterSequence(systemActivityStartAfterSequence);

  for (const item of timeline) {
    const date = getChatMessageTimelineDate(item);
    appendDateSeparator(date, `message-${item.message.clientMessageId}`);

    if (
      !readBoundaryInserted &&
      readBoundaryAfterSequence !== null &&
      item.kind === "confirmed" &&
      item.message.roomSequence > readBoundaryAfterSequence
    ) {
      rows.push(
        Object.freeze({
          afterSequence: readBoundaryAfterSequence,
          kind: "read-boundary",
          renderKey: `read-boundary-${readBoundaryAfterSequence}`,
        }),
      );
      readBoundaryInserted = true;
    }

    rows.push(Object.freeze({ item, kind: "message" }));

    if (item.kind === "confirmed") {
      appendActivitiesAfterSequence(item.message.roomSequence);
    }
  }

  return Object.freeze(rows);
}

function getChatMessageTimelineDate(item: ChatMessageTimelineItem): ChatMessageTimelineDate {
  const timestamp =
    item.kind === "confirmed" ? Date.parse(item.message.createdAt) : item.message.enqueuedAt;

  return getChatMessageTimelineDateFromTimestamp(timestamp);
}

function getChatMessageTimelineDateFromTimestamp(
  createdAt: string | number,
): ChatMessageTimelineDate {
  const timestamp = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);

  if (!Number.isFinite(timestamp)) {
    throw new RangeError("채팅 메시지 날짜를 계산할 수 없습니다.");
  }

  const parts = new Map(
    CHAT_MESSAGE_DATE_FORMATTER.formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));

  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError("채팅 메시지의 달력 날짜를 계산할 수 없습니다.");
  }

  return Object.freeze({
    day,
    key: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
    month,
    year,
  });
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}
