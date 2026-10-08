"use client";

import { ChatMessageComposer } from "@/components/chat-message-composer";
import { useChatMessageComposer } from "@/components/use-chat-message-composer";
import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomSessionControlsProps = Readonly<{
  roomId: string;
  view: ChatRoomSessionView;
}>;

export function ChatRoomSessionControls({ roomId, view }: ChatRoomSessionControlsProps) {
  const canDraft = view.canDraft;
  const composer = useChatMessageComposer({
    enabled: canDraft,
    roomId,
  });
  const presentation = getChatRoomComposerPresentation(view);

  return (
    <ChatMessageComposer
      canSend={composer.canSend}
      disabled={!canDraft}
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
  view: Pick<ChatRoomSessionView, "canDraft" | "kind">,
): Readonly<{
  disabledAppearance: "muted" | "stable";
  disabledMessage: string | null;
  placeholder: string;
}> {
  const placeholder = view.canDraft
    ? "메시지를 입력해 주세요."
    : view.kind === "authentication-required"
      ? "로그인 후 메시지를 입력할 수 있습니다."
      : view.kind === "pending"
        ? "메시지를 입력해 주세요."
        : view.kind === "replaced"
          ? "메시지를 입력해 주세요."
          : view.kind === "closed"
            ? "메시지를 입력해 주세요."
            : "채팅을 사용할 수 없습니다.";

  return {
    disabledAppearance: view.kind === "pending" || view.kind === "replaced" ? "stable" : "muted",
    disabledMessage: view.kind === "closed" ? "종료된 토론방에는 메시지를 보낼 수 없습니다." : null,
    placeholder,
  };
}
