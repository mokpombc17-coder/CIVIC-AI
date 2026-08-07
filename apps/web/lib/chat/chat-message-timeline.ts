import type { ChatMessage } from "./chat-room-contracts";
import type { ChatOutgoingMessage } from "./realtime/chat-message-outbox";

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
      item: ChatMessageTimelineItem;
      kind: "message";
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
): readonly ChatMessageTimelineRow[] {
  const rows: ChatMessageTimelineRow[] = [];
  let previousDateKey: string | null = null;

  for (const item of timeline) {
    const date = getChatMessageTimelineDate(item);

    if (date.key !== previousDateKey) {
      rows.push(
        Object.freeze({
          date,
          kind: "date-separator",
          renderKey: `date-separator-${date.key}`,
        }),
      );
      previousDateKey = date.key;
    }

    rows.push(Object.freeze({ item, kind: "message" }));
  }

  return Object.freeze(rows);
}

function getChatMessageTimelineDate(item: ChatMessageTimelineItem): ChatMessageTimelineDate {
  const timestamp =
    item.kind === "confirmed" ? Date.parse(item.message.createdAt) : item.message.enqueuedAt;

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
