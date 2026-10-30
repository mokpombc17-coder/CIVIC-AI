import type { ChatMessageViewportPhase } from "@/components/chat/chat-message-viewport-position";

export type ChatMessageReadStatePolicyInput = Readonly<{
  documentHasFocus: boolean;
  documentVisibilityState: DocumentVisibilityState;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  viewportPhase: ChatMessageViewportPhase;
}>;

export function canReportChatMessageReadState({
  documentHasFocus,
  documentVisibilityState,
  readStateEnabled,
  readStatePaused,
  viewportPhase,
}: ChatMessageReadStatePolicyInput): boolean {
  return (
    readStateEnabled &&
    !readStatePaused &&
    documentVisibilityState === "visible" &&
    documentHasFocus &&
    viewportPhase === "settled"
  );
}
