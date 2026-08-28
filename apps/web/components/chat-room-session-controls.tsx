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
  const placeholder = canDraft
    ? "메시지를 입력해 주세요."
    : view.kind === "authentication-required"
      ? "로그인 후 메시지를 입력할 수 있습니다."
      : view.kind === "pending"
        ? "채팅 준비가 끝나면 입력할 수 있습니다."
        : view.kind === "replaced"
          ? "이 탭에서 계속하기를 선택하면 입력할 수 있습니다."
          : "채팅을 사용할 수 없습니다.";

  return (
    <ChatMessageComposer
      canSend={composer.canSend}
      disabled={!canDraft}
      disabledMessage={!canDraft && view.kind === "pending" ? placeholder : null}
      draft={composer.draft}
      inputId={`chat-message-${roomId}`}
      onDraftChange={composer.setDraft}
      onSubmit={composer.send}
      placeholder={placeholder}
      validationError={composer.validationError}
    />
  );
}
