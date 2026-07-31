import type { ChatMessageTimelineItem } from "@/lib/chat/chat-message-timeline";

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

export type ChatMessageDeliveryViewStatus =
  "queued" | "sending" | "retry-waiting" | "accepted" | "failed" | "cancelled";

export type ChatMessageItemViewModel = Readonly<{
  clientMessageId: string;
  content: string;
  deliveryLabel: string | null;
  deliveryStatus: ChatMessageDeliveryViewStatus | null;
  deliveryTone: "pending" | "error" | null;
  isMine: boolean;
  renderKey: string;
  senderLabel: string | null;
  timeLabel: string;
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
        ? "채팅방 정보를 불러오고 있습니다."
        : `참여자 ${memberCount}명 · 방 상태 ${roomStatus} · 내 상태 ${participationStatus}`,
    statusLabel:
      status === "success" ? "REST 연동" : status === "error" ? "방 정보 조회 실패" : "조회 중",
    title: name ?? roomId,
  };
}

export function createChatMessageItemViewModels(
  timeline: readonly ChatMessageTimelineItem[],
  currentUserId: string | null,
): readonly ChatMessageItemViewModel[] {
  return timeline.map((item) => {
    if (item.kind === "outgoing") {
      const failed = item.message.status === "failed" || item.message.status === "cancelled";

      return {
        clientMessageId: item.message.clientMessageId,
        content: item.message.content,
        deliveryLabel: getOutgoingMessageStatusLabel(item.message),
        deliveryStatus: item.message.status,
        deliveryTone: failed ? "error" : "pending",
        isMine: true,
        renderKey: createChatMessageRenderKey(item.message.clientMessageId),
        senderLabel: null,
        timeLabel: formatMessageTime(item.message.enqueuedAt),
      };
    }

    const isMine = item.message.senderUserId === currentUserId;

    return {
      clientMessageId: item.message.clientMessageId,
      content: item.message.content ?? "삭제된 메시지입니다.",
      deliveryLabel: null,
      deliveryStatus: null,
      deliveryTone: null,
      isMine,
      renderKey: createChatMessageRenderKey(item.message.clientMessageId),
      senderLabel: isMine ? null : item.message.senderUserId,
      timeLabel: formatMessageTime(item.message.createdAt),
    };
  });
}

function createChatMessageRenderKey(clientMessageId: string): string {
  return `client-message-${clientMessageId}`;
}

function getOutgoingMessageStatusLabel(
  message: Extract<ChatMessageTimelineItem, { kind: "outgoing" }>["message"],
): string {
  switch (message.status) {
    case "queued":
      return "전송 대기 중";
    case "sending":
    case "retry-waiting":
      return "전송 중";
    case "accepted":
      return "전송 확인 중";
    case "failed":
    case "cancelled":
      return message.message ?? "메시지를 전송하지 못했습니다.";
  }
}

function formatMessageTime(createdAt: string | number): string {
  const timestamp = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isNaN(timestamp) ? String(createdAt) : MESSAGE_TIME_FORMATTER.format(timestamp);
}
