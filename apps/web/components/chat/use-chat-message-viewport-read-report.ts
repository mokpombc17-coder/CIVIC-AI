import { type RefObject, useCallback, useEffect } from "react";
import { canReportChatMessageReadState } from "@/components/chat/chat-message-read-state-policy";
import type { ChatMessageViewportPositionState } from "@/components/chat/chat-message-viewport-position";
import type { ChatMessageViewportItemViewModel } from "@/components/chat/chat-room-view-model";

export function useChatMessageViewportReadReport({
  items,
  latestConfirmedSequence,
  onReadThroughSequence,
  positionRef,
  readStateEnabled,
  readStatePaused,
  scrollElementRef,
}: Readonly<{
  items: readonly ChatMessageViewportItemViewModel[];
  latestConfirmedSequence: number | null;
  onReadThroughSequence: (throughSequence: number) => void;
  positionRef: RefObject<ChatMessageViewportPositionState>;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}>): () => void {
  const reportVisibleReadSequence = useCallback(() => {
    if (latestConfirmedSequence === null) {
      return;
    }

    const scrollElement = scrollElementRef.current;
    const position = positionRef.current;

    if (
      !canReportChatMessageReadState({
        documentHasFocus: document.hasFocus(),
        documentVisibilityState: document.visibilityState,
        isLatestSequenceVisible:
          scrollElement !== null && isSequenceVisible(scrollElement, latestConfirmedSequence),
        readStateEnabled,
        readStatePaused,
        viewportPhase: position.phase,
        viewportPin: position.pin,
      })
    ) {
      return;
    }

    onReadThroughSequence(latestConfirmedSequence);
  }, [
    latestConfirmedSequence,
    onReadThroughSequence,
    positionRef,
    readStateEnabled,
    readStatePaused,
    scrollElementRef,
  ]);

  useEffect(() => {
    const recheckReadState = () => reportVisibleReadSequence();
    document.addEventListener("visibilitychange", recheckReadState);
    window.addEventListener("focus", recheckReadState);
    return () => {
      document.removeEventListener("visibilitychange", recheckReadState);
      window.removeEventListener("focus", recheckReadState);
    };
  }, [reportVisibleReadSequence]);

  useEffect(() => {
    if (!readStateEnabled) {
      return;
    }

    if (positionRef.current.phase !== "settled") {
      return;
    }

    const frame = requestAnimationFrame(reportVisibleReadSequence);
    return () => cancelAnimationFrame(frame);
  }, [items, positionRef, readStateEnabled, reportVisibleReadSequence]);

  return reportVisibleReadSequence;
}

function isSequenceVisible(scrollElement: HTMLDivElement, roomSequence: number): boolean {
  const messageElement = scrollElement.querySelector<HTMLLIElement>(
    `[data-room-sequence="${roomSequence}"]`,
  );

  if (!messageElement) {
    return false;
  }

  const viewportBounds = scrollElement.getBoundingClientRect();
  const messageBounds = messageElement.getBoundingClientRect();
  return messageBounds.bottom > viewportBounds.top && messageBounds.top < viewportBounds.bottom;
}
