"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatRealtimeTransport } from "@/components/chat-realtime-provider";
import { chatMessageContentSchema } from "@/lib/chat/chat-room-contracts";
import { getChatMessageCommandFailurePresentation } from "@/lib/chat/realtime/chat-message-command-presentation";
import { ChatMessageSendError } from "@/lib/chat/realtime/chat-realtime-transport";

const MESSAGE_COMMAND_TIMEOUT_MS = 15_000;
const createClientMessageId = () => crypto.randomUUID();

type ChatMessageSubmission =
  | Readonly<{
      clientMessageId: string;
      content: string;
      status: "sending";
    }>
  | Readonly<{
      clientMessageId: string;
      content: string;
      message: string;
      retryAt: number;
      retryReady: boolean;
      retryable: boolean;
      status: "failed";
    }>
  | Readonly<{
      clientMessageId: string;
      content: string;
      status: "sent";
    }>;

type ChatMessageComposerRoomState = Readonly<{
  draft: string;
  roomId: string;
  submission: ChatMessageSubmission | null;
}>;

type UseChatMessageComposerOptions = Readonly<{
  createId?: () => string;
  enabled: boolean;
  roomId: string;
  timeoutMs?: number;
}>;

export type ChatMessageComposerState = Readonly<{
  canRetry: boolean;
  canSend: boolean;
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
  timeoutMs = MESSAGE_COMMAND_TIMEOUT_MS,
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

  const failSubmission = useCallback(
    (
      current: Extract<ChatMessageSubmission, { status: "sending" }>,
      message: string,
      retryable: boolean,
      retryAfterMs = 0,
    ) => {
      setDraftState((value) => value || current.content);
      setSubmission({
        ...current,
        status: "failed",
        message,
        retryReady: retryAfterMs <= 0,
        retryable,
        retryAt: Date.now() + retryAfterMs,
      });
    },
    [setDraftState, setSubmission],
  );

  useEffect(
    () =>
      transport.observeMessageCommandEvent((event) => {
        const current =
          submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;
        const clientMessageId =
          event.kind === "result" ? event.result.clientMessageId : event.clientMessageId;

        if (
          !current ||
          current.status !== "sending" ||
          event.roomId !== roomId ||
          clientMessageId !== current.clientMessageId
        ) {
          return;
        }

        const failure = getChatMessageCommandFailurePresentation(event);

        if (failure) {
          failSubmission(current, failure.message, failure.retryable, failure.retryAfterMs);
          return;
        }

        setSubmission({
          clientMessageId: current.clientMessageId,
          content: current.content,
          status: "sent",
        });
      }),
    [failSubmission, roomId, setSubmission, transport],
  );

  useEffect(() => {
    if (!submission || submission.status !== "sending") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const current =
        submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

      if (current?.status === "sending" && current.clientMessageId === submission.clientMessageId) {
        failSubmission(
          current,
          "메시지 전송 결과를 받지 못했습니다. 같은 메시지를 다시 시도할 수 있습니다.",
          true,
        );
      }
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [failSubmission, roomId, submission, timeoutMs]);

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
      const sending: ChatMessageSubmission = {
        clientMessageId,
        content,
        status: "sending",
      };
      setSubmission(sending);

      try {
        transport.sendRoomMessage({
          roomId,
          request: {
            clientMessageId,
            content,
          },
        });
        setDraftState("");
      } catch (cause) {
        const retryable = cause instanceof ChatMessageSendError ? cause.retryable : true;
        const message =
          cause instanceof Error ? cause.message : "메시지 전송 명령을 시작하지 못했습니다.";
        failSubmission(sending, message, retryable);
      }
    },
    [failSubmission, roomId, setDraftState, setSubmission, transport],
  );

  const send = useCallback(() => {
    const current =
      submissionRef.current.roomId === roomId ? submissionRef.current.submission : null;

    if (!enabled || current !== null) {
      return;
    }

    const result = chatMessageContentSchema.safeParse(draft);

    if (!result.success) {
      const clientMessageId = createId();
      setSubmission({
        clientMessageId,
        content: draft,
        status: "failed",
        message: result.error.issues[0]?.message ?? "메시지 내용을 확인해 주세요.",
        retryReady: false,
        retryable: false,
        retryAt: 0,
      });
      return;
    }

    publish(createId(), result.data);
  }, [createId, draft, enabled, publish, roomId, setSubmission]);

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

      if (current?.status !== "sending") {
        setSubmission(null);
      }
    },
    [roomId, setDraftState, setSubmission],
  );

  return {
    canRetry:
      enabled && submission?.status === "failed" && submission.retryable && submission.retryReady,
    canSend: enabled && submission === null && draft.trim().length > 0,
    draft,
    errorMessage: submission?.status === "failed" ? submission.message : null,
    isSending: submission?.status === "sending",
    retry,
    send,
    sent: submission?.status === "sent",
    setDraft,
  };
}
