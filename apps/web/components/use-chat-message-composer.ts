"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatRealtimeTransport } from "@/components/chat-realtime-provider";
import {
  chatMessageSendContentSchema,
  normalizeChatMessageContent,
} from "@/lib/chat/chat-room-contracts";
import {
  applyChatMessageCommandEvent,
  applyChatMessageDeliveryLifecycle,
  createFailedChatMessageSubmission,
  createSendingChatMessageSubmission,
  isPendingChatMessageSubmission,
  type ChatMessageSubmission,
  type ChatMessageSubmissionTransition,
} from "@/lib/chat/realtime/chat-message-composer-state";
import { ChatMessageSendError } from "@/lib/chat/realtime/chat-realtime-transport";

const createClientMessageId = () => crypto.randomUUID();

type ChatMessageComposerRoomState = Readonly<{
  draft: string;
  roomId: string;
  submission: ChatMessageSubmission | null;
}>;

type UseChatMessageComposerOptions = Readonly<{
  createId?: () => string;
  enabled: boolean;
  roomId: string;
}>;

export type ChatMessageComposerState = Readonly<{
  canRetry: boolean;
  canSend: boolean;
  deliveryStatus: "retry-waiting" | "sending" | null;
  draft: string;
  errorMessage: string | null;
  isSending: boolean;
  retry: () => void;
  send: () => void;
  sent: boolean;
  setDraft: (value: string) => void;
}>;

export function useChatMessageComposer({
  createId = createClientMessageId,
  enabled,
  roomId,
}: UseChatMessageComposerOptions): ChatMessageComposerState {
  const transport = useChatRealtimeTransport();
  const [roomState, setRoomState] = useState<ChatMessageComposerRoomState>({
    draft: "",
    roomId,
    submission: null,
  });
  const submissionRef = useRef<{
    roomId: string;
    submission: ChatMessageSubmission | null;
  }>({
    roomId,
    submission: null,
  });
  const draft = roomState.roomId === roomId ? roomState.draft : "";
  const submission = roomState.roomId === roomId ? roomState.submission : null;

  const setDraftState = useCallback(
    (next: string | ((current: string) => string)) => {
      setRoomState((current) => {
        const currentDraft = current.roomId === roomId ? current.draft : "";

        return {
          draft: typeof next === "function" ? next(currentDraft) : next,
          roomId,
          submission: current.roomId === roomId ? current.submission : null,
        };
      });
    },
    [roomId],
  );

  const setSubmission = useCallback(
    (next: ChatMessageSubmission | null) => {
      submissionRef.current = {
        roomId,
        submission: next,
      };
      setRoomState((current) => ({
        draft: current.roomId === roomId ? current.draft : "",
        roomId,
        submission: next,
      }));
    },
    [roomId],
  );

  const applyTransition = useCallback(
    ({ restoreDraft, submission: nextSubmission }: ChatMessageSubmissionTransition) => {
      if (restoreDraft !== null) {
        setDraftState((value) => value || restoreDraft);
      }

      setSubmission(nextSubmission);
    },
    [setDraftState, setSubmission],
  );

  useEffect(
    () =>
      transport.observeMessageCommandEvent((event) => {
        const current =
          submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;
        const transition = applyChatMessageCommandEvent(current, event);

        if (transition) {
          applyTransition(transition);
        }
      }),
    [applyTransition, roomId, transport],
  );

  useEffect(
    () =>
      transport.observeMessageDeliveryLifecycle((event) => {
        const current =
          submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;
        const transition = applyChatMessageDeliveryLifecycle(current, event);

        if (transition) {
          applyTransition(transition);
        }
      }),
    [applyTransition, roomId, transport],
  );

  useEffect(() => {
    if (
      !submission ||
      submission.status !== "failed" ||
      !submission.retryable ||
      submission.retryReady
    ) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        const current =
          submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

        if (
          current?.status === "failed" &&
          current.clientMessageId === submission.clientMessageId
        ) {
          setSubmission({
            ...current,
            retryReady: true,
          });
        }
      },
      Math.max(0, submission.retryAt - Date.now()),
    );
    return () => window.clearTimeout(timeoutId);
  }, [roomId, setSubmission, submission]);

  const publish = useCallback(
    (clientMessageId: string, content: string) => {
      const sending = createSendingChatMessageSubmission({
        clientMessageId,
        content,
        generation: transport.getRoomSnapshot().generation,
        roomId,
      });
      setSubmission(sending);
      setDraftState("");

      try {
        transport.sendRoomMessage({
          roomId,
          request: {
            clientMessageId,
            content,
          },
        });
      } catch (cause) {
        const retryable = cause instanceof ChatMessageSendError ? cause.retryable : true;
        const message =
          cause instanceof Error ? cause.message : "메시지 전송 명령을 시작하지 못했습니다.";
        applyTransition({
          restoreDraft: sending.content,
          submission: createFailedChatMessageSubmission({
            clientMessageId: sending.clientMessageId,
            content: sending.content,
            generation: sending.generation,
            message,
            retryable,
            roomId: sending.roomId,
          }),
        });
      }
    },
    [applyTransition, roomId, setDraftState, setSubmission, transport],
  );

  const send = useCallback(() => {
    const current =
      submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

    if (!enabled || current !== null) {
      return;
    }

    const result = chatMessageSendContentSchema.safeParse(draft);

    if (!result.success) {
      const clientMessageId = createId();
      setSubmission(
        createFailedChatMessageSubmission({
          clientMessageId,
          content: draft,
          generation: transport.getRoomSnapshot().generation,
          message: result.error.issues[0]?.message ?? "메시지 내용을 확인해 주세요.",
          retryable: false,
          roomId,
        }),
      );
      return;
    }

    publish(createId(), result.data);
  }, [createId, draft, enabled, publish, roomId, setSubmission, transport]);

  const retry = useCallback(() => {
    const current =
      submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

    if (
      !enabled ||
      !current ||
      current.status !== "failed" ||
      !current.retryable ||
      !current.retryReady
    ) {
      return;
    }

    publish(current.clientMessageId, current.content);
  }, [enabled, publish, roomId]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);

      const current =
        submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

      if (!isPendingChatMessageSubmission(current)) {
        setSubmission(null);
      }
    },
    [roomId, setDraftState, setSubmission],
  );

  return {
    canRetry:
      enabled && submission?.status === "failed" && submission.retryable && submission.retryReady,
    canSend: enabled && submission === null && normalizeChatMessageContent(draft).length > 0,
    deliveryStatus:
      submission?.status === "sending" || submission?.status === "retry-waiting"
        ? submission.status
        : null,
    draft,
    errorMessage: submission?.status === "failed" ? submission.message : null,
    isSending: isPendingChatMessageSubmission(submission),
    retry,
    send,
    sent: submission?.status === "sent",
    setDraft,
  };
}
