import { selectChatMessageAdmissionRetrySignal } from "./chat-message-admission-control";
import { getChatMessageCommandFailurePresentation } from "./chat-message-command-presentation";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import type { ChatMessageCommandEvent } from "./chat-realtime-transport";

type ChatMessageSubmissionIdentity = Readonly<{
  clientMessageId: string;
  content: string;
  generation: number;
  roomId: string;
}>;

export type ChatMessageSubmission =
  | (ChatMessageSubmissionIdentity &
      Readonly<{
        attempt: number;
        retryAt: number | null;
        status: "sending" | "retry-waiting";
      }>)
  | (ChatMessageSubmissionIdentity &
      Readonly<{
        attempt: number;
        previousStatus: "sending" | "retry-waiting";
        reason: string;
        status: "failure-pending";
      }>)
  | (ChatMessageSubmissionIdentity &
      Readonly<{
        message: string;
        retryAt: number;
        retryReady: boolean;
        retryable: boolean;
        status: "failed";
      }>)
  | (ChatMessageSubmissionIdentity &
      Readonly<{
        status: "sent";
      }>);

export type ChatMessageSubmissionTransition = Readonly<{
  restoreDraft: string | null;
  submission: ChatMessageSubmission | null;
}>;

type CreateChatMessageSubmissionInput = ChatMessageSubmissionIdentity;

export function createSendingChatMessageSubmission({
  clientMessageId,
  content,
  generation,
  roomId,
}: CreateChatMessageSubmissionInput): ChatMessageSubmission {
  return {
    attempt: 1,
    clientMessageId,
    content,
    generation,
    retryAt: null,
    roomId,
    status: "sending",
  };
}

export function applyChatMessageDeliveryLifecycle(
  current: ChatMessageSubmission | null,
  event: ChatMessageDeliveryLifecycleEvent,
): ChatMessageSubmissionTransition | null {
  if (
    !current ||
    current.status === "failed" ||
    current.status === "failure-pending" ||
    current.status === "sent" ||
    !matchesDelivery(current, event)
  ) {
    return null;
  }

  switch (event.status) {
    case "sending":
    case "retry-waiting":
      return {
        restoreDraft: null,
        submission: {
          ...current,
          attempt: event.attempt,
          retryAt: event.retryAt,
          status: event.status,
        },
      };
    case "sent":
      return {
        restoreDraft: null,
        submission: {
          clientMessageId: current.clientMessageId,
          content: current.content,
          generation: current.generation,
          roomId: current.roomId,
          status: "sent",
        },
      };
    case "failed":
      return {
        restoreDraft: null,
        submission: {
          attempt: current.attempt,
          clientMessageId: current.clientMessageId,
          content: current.content,
          generation: current.generation,
          previousStatus: current.status,
          reason: event.reason ?? "DELIVERY_FAILED",
          roomId: current.roomId,
          status: "failure-pending",
        },
      };
    case "cancelled":
      return {
        restoreDraft: current.content,
        submission: null,
      };
  }
}

export function applyChatMessageCommandEvent(
  current: ChatMessageSubmission | null,
  event: ChatMessageCommandEvent,
  now = Date.now(),
): ChatMessageSubmissionTransition | null {
  if (!current || current.status === "failed" || current.status === "sent") {
    return null;
  }

  const clientMessageId =
    event.kind === "result" ? event.result.clientMessageId : event.clientMessageId;

  if (event.roomId !== current.roomId || clientMessageId !== current.clientMessageId) {
    return null;
  }

  const failure = getChatMessageCommandFailurePresentation(event);

  if (!failure) {
    return {
      restoreDraft: null,
      submission: {
        clientMessageId: current.clientMessageId,
        content: current.content,
        generation: current.generation,
        roomId: current.roomId,
        status: "sent",
      },
    };
  }

  const admissionRetryExhausted =
    current.status === "failure-pending" &&
    ((event.kind === "result" && selectChatMessageAdmissionRetrySignal(event.result) !== null) ||
      current.reason === "MAX_ATTEMPTS_REACHED" ||
      (current.reason === "MAX_ELAPSED_TIME_REACHED" &&
        (current.previousStatus === "retry-waiting" || current.attempt > 1)));
  const retryable = failure.retryable && !admissionRetryExhausted;

  return {
    restoreDraft: current.content,
    submission: {
      clientMessageId: current.clientMessageId,
      content: current.content,
      generation: current.generation,
      message: failure.message,
      retryAt: now + failure.retryAfterMs,
      retryReady: retryable && failure.retryAfterMs <= 0,
      retryable,
      roomId: current.roomId,
      status: "failed",
    },
  };
}

export function createFailedChatMessageSubmission({
  clientMessageId,
  content,
  generation,
  message,
  retryable,
  roomId,
}: CreateChatMessageSubmissionInput &
  Readonly<{
    message: string;
    retryable: boolean;
  }>): ChatMessageSubmission {
  return {
    clientMessageId,
    content,
    generation,
    message,
    retryAt: 0,
    retryReady: retryable,
    retryable,
    roomId,
    status: "failed",
  };
}

export function isPendingChatMessageSubmission(submission: ChatMessageSubmission | null): boolean {
  return (
    submission?.status === "sending" ||
    submission?.status === "retry-waiting" ||
    submission?.status === "failure-pending"
  );
}

function matchesDelivery(
  submission: ChatMessageSubmission,
  event: ChatMessageDeliveryLifecycleEvent,
): boolean {
  return (
    event.clientMessageId === submission.clientMessageId &&
    event.generation === submission.generation &&
    event.roomId === submission.roomId
  );
}
