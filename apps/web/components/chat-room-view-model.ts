import type {
  ChatMessageTimelineItem,
  ChatMessageTimelineRow,
} from "@/lib/chat/chat-message-timeline";
import type {
  ChatMessageMutationStates,
  ChatMessageMutationViewState,
} from "@/components/chat-message-mutation-state";
import type { ChatMessageReadReceiptSummary } from "@/lib/chat/chat-message-read-receipt-projector";
import { UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME } from "@/lib/chat/chat-room-participant-profiles";
import { createChatRoomSystemActivityMessage } from "@/lib/chat/realtime/chat-room-system-activity";

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export type ChatRoomHeaderViewModel = Readonly<{
  description: string;
  statusLabel: string;
  title: string;
}>;

export type ChatMessageHistoryFeedback =
  | Readonly<{
      kind: "notice";
      message: string;
    }>
  | Readonly<{
      kind: "error";
      message: string;
      title: string;
    }>;

export type ChatMessageDeliveryViewStatus =
  "queued" | "sending" | "retry-waiting" | "accepted" | "failed" | "cancelled";

export type ChatMessageItemViewModel = Readonly<{
  canOpenActions: boolean;
  canMutate: boolean;
  clientMessageId: string;
  content: string;
  deliveryLabel: string | null;
  deliveryStatus: ChatMessageDeliveryViewStatus | null;
  deliveryTone: "pending" | "error" | null;
  endsSenderGroup: boolean;
  isDeleted: boolean;
  isEdited: boolean;
  isMine: boolean;
  messageId: string | null;
  mutation: ChatMessageMutationViewState | null;
  unreadCount: number | null;
  unreadReceiptLabel: string | null;
  renderKey: string;
  roomSequence: number | null;
  senderIsOwner: boolean;
  senderLabel: string | null;
  startsSenderGroup: boolean;
  timeLabel: string;
}>;

export type ChatMessageViewportItemViewModel =
  | Readonly<{
      date: Extract<ChatMessageTimelineRow, { kind: "date-separator" }>["date"];
      kind: "date-separator";
      renderKey: string;
    }>
  | Readonly<{
      afterSequence: number;
      kind: "read-boundary";
      renderKey: string;
    }>
  | Readonly<{
      kind: "system-activity";
      message: string;
      renderKey: string;
    }>
  | Readonly<{
      item: ChatMessageItemViewModel;
      kind: "message";
      renderKey: string;
    }>;

type CreateChatRoomHeaderViewModelInput = Readonly<{
  memberCount: number | undefined;
  name: string | undefined;
  participationStatus: string | undefined;
  roomId: string;
  roomStatus: string | undefined;
  status: "pending" | "error" | "success";
}>;

export function createChatRoomHeaderViewModel({
  memberCount,
  name,
  participationStatus,
  roomId,
  roomStatus,
  status,
}: CreateChatRoomHeaderViewModelInput): ChatRoomHeaderViewModel {
  return {
    description:
      memberCount === undefined
        ? "토론방 정보를 불러오고 있습니다."
        : `참여자 ${memberCount}명 · 방 상태 ${roomStatus} · 내 상태 ${participationStatus}`,
    statusLabel:
      status === "success" ? "REST 연동" : status === "error" ? "방 정보 조회 실패" : "조회 중",
    title: name ?? roomId,
  };
}

export function createChatMessageItemViewModels(
  timeline: readonly ChatMessageTimelineItem[],
  selfMembershipId: string | null,
  mutationStates: ChatMessageMutationStates = new Map(),
  readReceiptSummaries: ReadonlyMap<string, ChatMessageReadReceiptSummary> = new Map(),
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
  ownerMembershipId: string | null = null,
  canMutateMessages = true,
): readonly ChatMessageItemViewModel[] {
  const groupKeys = timeline.map((item) => createChatMessageSenderGroupKey(item, selfMembershipId));

  return timeline.map((item, index) => {
    const groupKey = groupKeys[index] ?? null;
    const startsSenderGroup = startsNewChatMessageSenderGroup(
      groupKeys[index - 1] ?? null,
      groupKey,
    );
    const endsSenderGroup = startsNewChatMessageSenderGroup(groupKey, groupKeys[index + 1] ?? null);

    return createChatMessageItemViewModel(
      item,
      selfMembershipId,
      participantDisplayNames,
      ownerMembershipId,
      mutationStates,
      readReceiptSummaries,
      startsSenderGroup,
      endsSenderGroup,
      canMutateMessages,
    );
  });
}

export function createChatMessageViewportItemViewModels(
  rows: readonly ChatMessageTimelineRow[],
  selfMembershipId: string | null,
  mutationStates: ChatMessageMutationStates = new Map(),
  readReceiptSummaries: ReadonlyMap<string, ChatMessageReadReceiptSummary> = new Map(),
  participantDisplayNames: ReadonlyMap<string, string> = new Map(),
  ownerMembershipId: string | null = null,
  canMutateMessages = true,
): readonly ChatMessageViewportItemViewModel[] {
  let previousGroupKey: ChatMessageSenderGroupKey | null = null;

  return rows.map((row, index) => {
    if (row.kind === "date-separator") {
      previousGroupKey = null;
      return {
        date: row.date,
        kind: "date-separator",
        renderKey: row.renderKey,
      };
    }

    if (row.kind === "read-boundary") {
      previousGroupKey = null;
      return {
        afterSequence: row.afterSequence,
        kind: "read-boundary",
        renderKey: row.renderKey,
      };
    }

    if (row.kind === "system-activity") {
      previousGroupKey = null;
      return {
        kind: "system-activity",
        message: createChatRoomSystemActivityMessage(row.activity, participantDisplayNames),
        renderKey: row.renderKey,
      };
    }

    const groupKey = createChatMessageSenderGroupKey(row.item, selfMembershipId);
    const startsSenderGroup = startsNewChatMessageSenderGroup(previousGroupKey, groupKey);
    const nextRow = rows[index + 1];
    const nextGroupKey =
      nextRow?.kind === "message"
        ? createChatMessageSenderGroupKey(nextRow.item, selfMembershipId)
        : null;
    const endsSenderGroup = startsNewChatMessageSenderGroup(groupKey, nextGroupKey);
    previousGroupKey = groupKey;
    const item = createChatMessageItemViewModel(
      row.item,
      selfMembershipId,
      participantDisplayNames,
      ownerMembershipId,
      mutationStates,
      readReceiptSummaries,
      startsSenderGroup,
      endsSenderGroup,
      canMutateMessages,
    );
    return {
      item,
      kind: "message",
      renderKey: item.renderKey,
    };
  });
}

function createChatMessageItemViewModel(
  item: ChatMessageTimelineItem,
  selfMembershipId: string | null,
  participantDisplayNames: ReadonlyMap<string, string>,
  ownerMembershipId: string | null,
  mutationStates: ChatMessageMutationStates,
  readReceiptSummaries: ReadonlyMap<string, ChatMessageReadReceiptSummary>,
  startsSenderGroup: boolean,
  endsSenderGroup: boolean,
  canMutateMessages: boolean,
): ChatMessageItemViewModel {
  const selfDisplayName =
    selfMembershipId === null ? null : (participantDisplayNames.get(selfMembershipId) ?? null);

  if (item.kind === "outgoing") {
    const failed = item.message.status === "failed" || item.message.status === "cancelled";

    return {
      canOpenActions: false,
      canMutate: false,
      clientMessageId: item.message.clientMessageId,
      content: item.message.content,
      deliveryLabel: getOutgoingMessageStatusLabel(item.message),
      deliveryStatus: item.message.status,
      deliveryTone: failed ? "error" : "pending",
      endsSenderGroup,
      isDeleted: false,
      isEdited: false,
      isMine: true,
      messageId: null,
      mutation: null,
      unreadCount: null,
      unreadReceiptLabel: null,
      renderKey: createChatMessageRenderKey(item.message.clientMessageId),
      roomSequence: null,
      senderIsOwner: selfMembershipId !== null && selfMembershipId === ownerMembershipId,
      senderLabel: selfDisplayName,
      startsSenderGroup,
      timeLabel: formatMessageTime(item.message.enqueuedAt),
    };
  }

  const isMine = item.message.senderMembershipId === selfMembershipId;
  const unreadCount = readReceiptSummaries.get(item.message.messageId)?.unreadCount ?? 0;
  const visibleUnreadCount =
    isMine && item.message.state === "ACTIVE" && unreadCount > 0 ? unreadCount : null;

  return {
    canOpenActions: item.message.state === "ACTIVE" && item.message.content !== null,
    canMutate:
      canMutateMessages &&
      isMine &&
      item.message.state === "ACTIVE" &&
      item.message.content !== null,
    clientMessageId: item.message.clientMessageId,
    content: item.message.content ?? "삭제된 메시지입니다.",
    deliveryLabel: null,
    deliveryStatus: null,
    deliveryTone: null,
    endsSenderGroup,
    isDeleted: item.message.state === "DELETED_BY_AUTHOR",
    isEdited: item.message.state === "ACTIVE" && item.message.messageVersion > 1,
    isMine,
    messageId: item.message.messageId,
    mutation: mutationStates.get(item.message.messageId) ?? null,
    unreadCount: visibleUnreadCount,
    unreadReceiptLabel: visibleUnreadCount === null ? null : `${visibleUnreadCount}명 안 읽음`,
    renderKey: createChatMessageRenderKey(item.message.clientMessageId),
    roomSequence: item.message.roomSequence,
    senderIsOwner: item.message.senderMembershipId === ownerMembershipId,
    senderLabel:
      participantDisplayNames.get(item.message.senderMembershipId) ??
      (isMine ? selfDisplayName : UNKNOWN_ROOM_PARTICIPANT_DISPLAY_NAME),
    startsSenderGroup,
    timeLabel: formatMessageTime(item.message.createdAt),
  };
}

type ChatMessageSenderGroupKey = Readonly<{
  minute: number;
  senderMembershipId: string;
}>;

function createChatMessageSenderGroupKey(
  item: ChatMessageTimelineItem,
  selfMembershipId: string | null,
): ChatMessageSenderGroupKey | null {
  const senderMembershipId =
    item.kind === "confirmed" ? item.message.senderMembershipId : selfMembershipId;
  const timestamp =
    item.kind === "confirmed" ? Date.parse(item.message.createdAt) : item.message.enqueuedAt;

  if (senderMembershipId === null || !Number.isFinite(timestamp)) {
    return null;
  }

  return {
    minute: Math.floor(timestamp / 60_000),
    senderMembershipId,
  };
}

function startsNewChatMessageSenderGroup(
  previous: ChatMessageSenderGroupKey | null,
  current: ChatMessageSenderGroupKey | null,
): boolean {
  return (
    previous === null ||
    current === null ||
    previous.senderMembershipId !== current.senderMembershipId ||
    previous.minute !== current.minute
  );
}

function createChatMessageRenderKey(clientMessageId: string): string {
  return `client-message-${clientMessageId}`;
}

function getOutgoingMessageStatusLabel(
  message: Extract<ChatMessageTimelineItem, { kind: "outgoing" }>["message"],
): string | null {
  switch (message.status) {
    case "queued":
      return "전송 대기 중";
    case "sending":
    case "retry-waiting":
      return "전송 중";
    case "accepted":
      return null;
    case "failed":
    case "cancelled":
      return message.message ?? "메시지를 전송하지 못했습니다.";
  }
}

function formatMessageTime(createdAt: string | number): string {
  const timestamp = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isNaN(timestamp) ? String(createdAt) : MESSAGE_TIME_FORMATTER.format(timestamp);
}
