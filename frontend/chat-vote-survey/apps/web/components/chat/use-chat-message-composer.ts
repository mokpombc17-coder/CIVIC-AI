"use client";

import { useCallback, useState } from "react";
import {
  useChatMessageOutbox,
  useChatRealtimeTransport,
} from "@/components/chat/chat-realtime-provider";
import {
  chatMessageSendContentSchema,
  normalizeChatMessageContent,
} from "@/lib/chat/chat-room-contracts";

const createClientMessageId = () => crypto.randomUUID();

type ChatMessageComposerRoomState = Readonly<{
  draft: string;
  roomId: string;
  validationError: string | null;
}>;

type UseChatMessageComposerOptions = Readonly<{
  createId?: () => string;
  enabled: boolean;
  onSent?: (() => void) | undefined;
  roomId: string;
}>;

export type ChatMessageComposerState = Readonly<{
  canSend: boolean;
  draft: string;
  send: () => void;
  setDraft: (value: string) => void;
  validationError: string | null;
}>;

export function useChatMessageComposer({
  createId = createClientMessageId,
  enabled,
  onSent,
  roomId,
}: UseChatMessageComposerOptions): ChatMessageComposerState {
  const outbox = useChatMessageOutbox();
  const transport = useChatRealtimeTransport();
  const [roomState, setRoomState] = useState<ChatMessageComposerRoomState>({
    draft: "",
    roomId,
    validationError: null,
  });
  const draft = roomState.roomId === roomId ? roomState.draft : "";
  const validationError = roomState.roomId === roomId ? roomState.validationError : null;

  const send = useCallback(() => {
    if (!enabled) {
      return;
    }

    const result = chatMessageSendContentSchema.safeParse(draft);

    if (!result.success) {
      setRoomState({
        draft,
        roomId,
        validationError: result.error.issues[0]?.message ?? "메시지 내용을 확인해 주세요.",
      });
      return;
    }

    outbox.enqueue({
      clientMessageId: createId(),
      content: result.data,
      generation: transport.getRoomSnapshot().generation,
      roomId,
    });
    setRoomState({
      draft: "",
      roomId,
      validationError: null,
    });
    onSent?.();
  }, [createId, draft, enabled, onSent, outbox, roomId, transport]);

  const setDraft = useCallback(
    (value: string) => {
      setRoomState({
        draft: value,
        roomId,
        validationError: null,
      });
    },
    [roomId],
  );

  return {
    canSend: enabled && normalizeChatMessageContent(draft).length > 0,
    draft,
    send,
    setDraft,
    validationError,
  };
}
