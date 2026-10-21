import type { ChatMessageViewportPosition } from "@/components/chat/chat-message-viewport-state";

export type ChatMessageReadStatePolicyInput = Readonly<{
  documentHasFocus: boolean;
  documentVisibilityState: DocumentVisibilityState;
  isLatestSequenceVisible: boolean;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  viewportPosition: ChatMessageViewportPosition;
}>;

export function canReportChatMessageReadState({
  documentHasFocus,
  documentVisibilityState,
  isLatestSequenceVisible,
  readStateEnabled,
  readStatePaused,
  viewportPosition,
}: ChatMessageReadStatePolicyInput): boolean {
  return (
    readStateEnabled &&
    !readStatePaused &&
    documentVisibilityState === "visible" &&
    documentHasFocus &&
    viewportPosition === "pinned" &&
    isLatestSequenceVisible
  );
}
