"use client";

import { ChatMessageComposer } from "@/components/chat/chat-message-composer";
import { useChatMessageComposer } from "@/components/chat/use-chat-message-composer";
import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomSessionControlsProps = Readonly<{
  onMessageSent?: (() => void) | undefined;
  roomId: string;
  view: ChatRoomSessionView;
}>;

export function ChatRoomSessionControls({
  onMessageSent,
  roomId,
  view,
}: ChatRoomSessionControlsProps) {
  const composer = useChatMessageComposer({
    enabled: view.canSend,
    onSent: onMessageSent,
    roomId,
  });
  const presentation = getChatRoomComposerPresentation(view);

  return (
    <ChatMessageComposer
      canSend={composer.canSend}
      disabled={!view.canCompose}
      disabledAppearance={presentation.disabledAppearance}
      disabledMessage={presentation.disabledMessage}
      draft={composer.draft}
      inputId={`chat-message-${roomId}`}
      onDraftChange={composer.setDraft}
      onSubmit={composer.send}
      placeholder={presentation.placeholder}
      validationError={composer.validationError}
    />
  );
}

export function getChatRoomComposerPresentation(
  view: Pick<ChatRoomSessionView, "canCompose" | "kind">,
): Readonly<{
  disabledAppearance: "muted" | "stable";
  disabledMessage: string | null;
  placeholder: string;
}> {
  return {
    disabledAppearance: view.kind === "pending" ? "stable" : "muted",
    disabledMessage: null,
    placeholder: view.canCompose ? "메시지를 입력해 주세요." : "채팅을 사용할 수 없습니다.",
  };
}
