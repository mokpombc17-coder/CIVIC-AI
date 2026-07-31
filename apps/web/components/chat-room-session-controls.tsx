"use client";

import { ChatMessageComposer } from "@/components/chat-message-composer";
import type { ChatRealtimeRoomState } from "@/components/chat-realtime-provider";
import { ChatRoomSessionBanner } from "@/components/chat-room-session-banner";
import { useChatMessageComposer } from "@/components/use-chat-message-composer";
import { getChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomSessionControlsProps = Readonly<{
  realtimeReady: boolean;
  roomId: string;
  session: ChatRealtimeRoomState;
}>;

export function ChatRoomSessionControls({
  realtimeReady,
  roomId,
  session,
}: ChatRoomSessionControlsProps) {
  const view = getChatRoomSessionView(session, roomId);
  const canDraft = view.canDraft && realtimeReady;
  const composer = useChatMessageComposer({
    enabled: canDraft,
    roomId,
  });
  const placeholder = canDraft
    ? "메시지를 입력해 주세요."
    : view.canDraft
      ? "메시지 동기화가 끝나면 입력할 수 있습니다."
      : "이 탭을 활성화하면 메시지를 입력할 수 있습니다.";

  return (
    <>
      <ChatRoomSessionBanner
        canReactivate={view.canReactivate}
        description={view.description}
        kind={view.kind}
        onReactivate={session.reactivate}
        title={view.title}
      />
      <ChatMessageComposer
        canSend={composer.canSend}
        disabled={!canDraft}
        draft={composer.draft}
        inputId={`chat-message-${roomId}`}
        onDraftChange={composer.setDraft}
        onSubmit={composer.send}
        placeholder={placeholder}
        validationError={composer.validationError}
      />
    </>
  );
}
