import type { RoomInboxLastMessage } from "@/lib/chat/chat-room-contracts";

export type RoomInboxPreviewPresentation = Readonly<{
  text: string;
  tone: "normal" | "muted" | "deleted";
}>;

export function getRoomInboxPreviewPresentation(
  lastMessage: RoomInboxLastMessage | null,
): RoomInboxPreviewPresentation {
  if (lastMessage === null) {
    return {
      text: "표시할 메시지가 없습니다.",
      tone: "muted",
    };
  }

  if (lastMessage.state === "DELETED_BY_AUTHOR") {
    return {
      text: "삭제된 메시지입니다.",
      tone: "deleted",
    };
  }

  if (lastMessage.preview.length === 0) {
    return {
      text: "메시지가 있습니다.",
      tone: "muted",
    };
  }

  return {
    text:
      lastMessage.previewTruncated && !lastMessage.preview.endsWith("…")
        ? `${lastMessage.preview}…`
        : lastMessage.preview,
    tone: "normal",
  };
}
