import type { ChatMessageAppendSource } from "@/components/chat/chat-message-viewport-state";
import type {
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat/chat-room-view-model";

export type ChatMessageViewportItemsSnapshot = Readonly<{
  lastRenderKey: string | null;
  viewportContinuityKey: string;
}>;

export type ChatMessageViewportAppend = Readonly<{
  appendedMessages: readonly ChatMessageItemViewModel[];
  hasAppendedSystemActivity: boolean;
  isNewViewport: boolean;
  source: ChatMessageAppendSource;
}>;

export function createChatMessageViewportItemsSnapshot(
  items: readonly ChatMessageViewportItemViewModel[],
  viewportContinuityKey: string,
): ChatMessageViewportItemsSnapshot {
  return {
    lastRenderKey: items.at(-1)?.renderKey ?? null,
    viewportContinuityKey,
  };
}

export function detectChatMessageViewportAppend({
  items,
  previous,
  viewportContinuityKey,
}: {
  items: readonly ChatMessageViewportItemViewModel[];
  previous: ChatMessageViewportItemsSnapshot | null;
  viewportContinuityKey: string;
}): ChatMessageViewportAppend {
  const isNewViewport = previous?.viewportContinuityKey !== viewportContinuityKey;
  const previousLatestIndex =
    previous?.lastRenderKey === null
      ? -1
      : items.findIndex((item) => item.renderKey === previous?.lastRenderKey);
  // 이전 마지막 항목이 사라졌거나 그대로 마지막이면 뒤에 붙은 항목이 없는 것으로 봄
  const appendedItems =
    !isNewViewport && previousLatestIndex >= 0 && previousLatestIndex < items.length - 1
      ? items.slice(previousLatestIndex + 1)
      : [];
  const appendedMessages = appendedItems.flatMap((item) =>
    item.kind === "message" ? [item.item] : [],
  );

  return {
    appendedMessages,
    hasAppendedSystemActivity: appendedItems.some((item) => item.kind === "system-activity"),
    isNewViewport,
    source: appendedMessages.some((item) => item.isMine && item.deliveryTone !== null)
      ? "current-user"
      : "realtime",
  };
}
