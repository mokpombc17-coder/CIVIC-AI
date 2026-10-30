import { type RefObject, useEffect } from "react";
import type {
  ChatMessageViewportPositionEvent,
  ChatMessageViewportPositionState,
} from "@/components/chat/chat-message-viewport-position";
import {
  type ChatMessageViewportInitialScrollTarget,
  findChatMessageInitialScrollIndex,
} from "@/components/chat/chat-message-viewport-state";
import type { ChatMessageViewportItemViewModel } from "@/components/chat/chat-room-view-model";
import { isChatMessageViewportAtEnd } from "@/components/chat/use-chat-message-viewport-position";

export function useChatMessageViewportInitialTarget({
  dispatchPosition,
  initialScrollTarget,
  items,
  positionRef,
  scrollElementRef,
  viewportKey,
}: Readonly<{
  dispatchPosition: (event: ChatMessageViewportPositionEvent) => ChatMessageViewportPositionState;
  initialScrollTarget: ChatMessageViewportInitialScrollTarget;
  items: readonly ChatMessageViewportItemViewModel[];
  positionRef: RefObject<ChatMessageViewportPositionState>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  viewportKey: string;
}>) {
  // 목록과 진입 목표가 그대로여도 다른 timeline으로 바뀌면 목표를 다시 확인해야 하므로 viewportKey도 트리거로 둠
  useEffect(() => {
    if (positionRef.current.phase !== "waiting" || initialScrollTarget.kind === "pending") {
      return;
    }

    const scrollElement = scrollElementRef.current;
    dispatchPosition({
      type: "target-resolved",
      hasItems: items.length > 0,
      hasTarget: findChatMessageInitialScrollIndex(items, initialScrollTarget) !== null,
      isAtEnd: scrollElement === null || isChatMessageViewportAtEnd(scrollElement),
    });
  }, [dispatchPosition, initialScrollTarget, items, positionRef, scrollElementRef, viewportKey]);
}
