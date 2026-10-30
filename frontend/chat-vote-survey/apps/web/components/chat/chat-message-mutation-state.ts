import type { ChatMessageMutationLifecycleEvent } from "@/lib/chat/realtime/chat-message-mutation-scheduler";
import type { ChatMessageMutationCommandType } from "@/lib/chat/realtime/chat-stomp-contracts";

export type ChatMessageMutationViewStatus =
  "queued" | "sending" | "retry-waiting" | "completed" | "failed" | "cancelled";

export type ChatMessageMutationViewState = Readonly<{
  clientMutationId: string;
  commandType: ChatMessageMutationCommandType;
  error: string | null;
  status: ChatMessageMutationViewStatus;
}>;

export type ChatMessageMutationStates = ReadonlyMap<string, ChatMessageMutationViewState>;

export type ChatMessageMutationStartResult =
  | Readonly<{
      clientMutationId: string;
      ok: true;
    }>
  | Readonly<{
      error: string;
      ok: false;
    }>;

export function reduceChatMessageMutationLifecycle(
  states: ChatMessageMutationStates,
  event: ChatMessageMutationLifecycleEvent,
  context: Readonly<{
    generation: number;
    roomId: string;
  }>,
): ChatMessageMutationStates {
  if (event.roomId !== context.roomId || event.generation !== context.generation) {
    return states;
  }

  const nextStates = new Map(states);
  nextStates.set(event.messageId, {
    clientMutationId: event.clientMutationId,
    commandType: event.commandType,
    error: createMutationError(event),
    status: event.status,
  });
  return nextStates;
}

export function createLocalChatMessageMutationState(
  input: Readonly<{
    clientMutationId: string;
    commandType: ChatMessageMutationCommandType;
  }>,
): ChatMessageMutationViewState {
  return {
    ...input,
    error: null,
    status: "queued",
  };
}

export function createFailedChatMessageMutationState(
  input: Readonly<{
    clientMutationId: string;
    commandType: ChatMessageMutationCommandType;
    error: string;
  }>,
): ChatMessageMutationViewState {
  return {
    ...input,
    status: "failed",
  };
}

export function isChatMessageMutationPending(state: ChatMessageMutationViewState | null): boolean {
  return (
    state?.status === "queued" || state?.status === "sending" || state?.status === "retry-waiting"
  );
}

export function getChatMessageMutationErrorMessage(
  commandType: ChatMessageMutationCommandType,
  status: "cancelled" | "failed",
): string {
  if (commandType === "EDIT_MESSAGE") {
    return status === "failed"
      ? "메시지를 수정하지 못했어요. 잠시 후 다시 시도해 주세요."
      : "메시지 수정이 취소됐어요. 다시 시도해 주세요.";
  }

  return status === "failed"
    ? "메시지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요."
    : "메시지 삭제가 취소됐어요. 다시 시도해 주세요.";
}

function createMutationError(event: ChatMessageMutationLifecycleEvent): string | null {
  switch (event.status) {
    case "failed":
      return getChatMessageMutationErrorMessage(event.commandType, "failed");
    case "cancelled":
      return getChatMessageMutationErrorMessage(event.commandType, "cancelled");
    case "queued":
    case "sending":
    case "retry-waiting":
    case "completed":
      return null;
  }
}
