import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createChatMessageArrivalAnnouncement } from "@/components/chat/chat-message-arrival-announcement";
import {
  type ChatMessageViewportItemsSnapshot,
  createChatMessageViewportItemsSnapshot,
  detectChatMessageViewportAppend,
} from "@/components/chat/chat-message-viewport-append";
import {
  type ChatMessageViewportPositionEvent,
  type ChatMessageViewportPositionState,
  shouldCountUnseenChatMessages,
} from "@/components/chat/chat-message-viewport-position";
import type { ChatMessageViewportItemViewModel } from "@/components/chat/chat-room-view-model";

export type ChatMessageArrivalAnnouncement = Readonly<{
  id: number;
  message: string;
}>;

export type ChatMessageViewportLatestFollow = Readonly<{
  arrivalAnnouncement: ChatMessageArrivalAnnouncement | null;
  jumpToLatest: () => void;
  markLatestReached: () => void;
  reset: () => void;
  unseenMessageCount: number;
}>;

export function useChatMessageViewportLatestFollow({
  dispatchPosition,
  items,
  onNavigateToLatest,
  positionRef,
  viewportContinuityKey,
}: Readonly<{
  dispatchPosition: (event: ChatMessageViewportPositionEvent) => ChatMessageViewportPositionState;
  items: readonly ChatMessageViewportItemViewModel[];
  onNavigateToLatest: (() => void) | null | undefined;
  positionRef: RefObject<ChatMessageViewportPositionState>;
  viewportContinuityKey: string;
}>): ChatMessageViewportLatestFollow {
  const previousItemsRef = useRef<ChatMessageViewportItemsSnapshot | null>(null);
  const arrivalAnnouncementSequenceRef = useRef(0);
  const [unseenMessageCount, setUnseenMessageCount] = useState(0);
  const [arrivalAnnouncement, setArrivalAnnouncement] =
    useState<ChatMessageArrivalAnnouncement | null>(null);

  const markLatestReached = useCallback(() => setUnseenMessageCount(0), []);

  const reset = useCallback(() => {
    setUnseenMessageCount(0);
    setArrivalAnnouncement(null);
  }, []);

  const jumpToLatest = useCallback(() => {
    setUnseenMessageCount(0);

    if (onNavigateToLatest) {
      dispatchPosition({
        type: "latest-requested",
        navigatesContext: true,
      });
      onNavigateToLatest();
      return;
    }

    dispatchPosition({
      type: "latest-requested",
      navigatesContext: false,
    });
  }, [dispatchPosition, onNavigateToLatest]);

  useEffect(() => {
    const previous = previousItemsRef.current;
    previousItemsRef.current = createChatMessageViewportItemsSnapshot(items, viewportContinuityKey);

    if (items.length === 0) {
      return;
    }

    const {
      appendedMessages,
      hasAppendedSystemActivity,
      isNewViewport,
      source: appendSource,
    } = detectChatMessageViewportAppend({
      items,
      previous,
      viewportContinuityKey,
    });

    if (isNewViewport) {
      setUnseenMessageCount(0);
    }

    if (appendedMessages.length > 0) {
      const announcedItems = appendedMessages.filter((item) => item.deliveryTone === null);
      const announcement = createChatMessageArrivalAnnouncement(announcedItems);

      if (announcement) {
        arrivalAnnouncementSequenceRef.current += 1;
        setArrivalAnnouncement({
          id: arrivalAnnouncementSequenceRef.current,
          message: announcement,
        });
      }
    }

    if (appendedMessages.length === 0 && !hasAppendedSystemActivity) {
      return;
    }

    const appendEvent = {
      type: "messages-appended",
      hasMessages: appendedMessages.length > 0,
      hasSystemActivity: hasAppendedSystemActivity,
      source: appendSource,
    } as const;

    if (shouldCountUnseenChatMessages(positionRef.current, appendEvent)) {
      setUnseenMessageCount((count) => count + appendedMessages.length);
    }

    dispatchPosition(appendEvent);
  }, [dispatchPosition, items, positionRef, viewportContinuityKey]);

  return {
    arrivalAnnouncement,
    jumpToLatest,
    markLatestReached,
    reset,
    unseenMessageCount,
  };
}
