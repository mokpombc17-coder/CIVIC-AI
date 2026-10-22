import type {
  ChatMessageViewportPhase,
  ChatMessageViewportPin,
} from "@/components/chat/chat-message-viewport-position";

export type ChatMessageReadStatePolicyInput = Readonly<{
  documentHasFocus: boolean;
  documentVisibilityState: DocumentVisibilityState;
  isLatestSequenceVisible: boolean;
  readStateEnabled: boolean;
  readStatePaused: boolean;
  viewportPhase: ChatMessageViewportPhase;
  viewportPin: ChatMessageViewportPin;
}>;

export function canReportChatMessageReadState({
  documentHasFocus,
  documentVisibilityState,
  isLatestSequenceVisible,
  readStateEnabled,
  readStatePaused,
  viewportPhase,
  viewportPin,
}: ChatMessageReadStatePolicyInput): boolean {
  return (
    readStateEnabled &&
    !readStatePaused &&
    documentVisibilityState === "visible" &&
    documentHasFocus &&
    viewportPhase === "settled" &&
    viewportPin === "pinned" &&
    isLatestSequenceVisible
  );
}
