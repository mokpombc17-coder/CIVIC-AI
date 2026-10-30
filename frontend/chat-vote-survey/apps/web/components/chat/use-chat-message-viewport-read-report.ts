import { type RefObject, useCallback, useEffect } from "react";
import { canReportChatMessageReadState } from "@/components/chat/chat-message-read-state-policy";
import { findChatMessageViewportReadThroughSequence } from "@/components/chat/chat-message-viewport-read-position";
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

    if (
      scrollElement === null ||
      !canReportChatMessageReadState({
        documentHasFocus: document.hasFocus(),
        documentVisibilityState: document.visibilityState,
        readStateEnabled,
        readStatePaused,
        viewportPhase: positionRef.current.phase,
      })
    ) {
      return;
    }

    const readThroughSequence = findChatMessageViewportReadThroughSequence(scrollElement);

    // 이미 보냈거나 더 작은 순번은 coordinator가 보내지 않으므로 여기서는 거르지 않음
    // 서버가 모르는 순번을 보내면 409가 나므로 최신 확정 순번까지만 보냄
    if (readThroughSequence !== null) {
      onReadThroughSequence(Math.min(readThroughSequence, latestConfirmedSequence));
    }
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
