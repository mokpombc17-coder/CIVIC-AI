import type { ChatMessageItemViewModel } from "@/components/chat-room-view-model";

export function createChatMessageArrivalAnnouncement(
  items: readonly ChatMessageItemViewModel[],
): string | null {
  const latestItem = items.at(-1);

  if (!latestItem) {
    return null;
  }

  const latestMessage = `${getMessageSenderLabel(latestItem)}: ${latestItem.content}`;

  return items.length === 1
    ? latestMessage
    : `새 메시지 ${items.length}개가 도착했습니다. 마지막 메시지, ${latestMessage}`;
}

function getMessageSenderLabel(item: ChatMessageItemViewModel): string {
  if (item.isMine) {
    return "내 메시지";
  }

  return item.senderLabel ?? "알 수 없는 참여자";
}
