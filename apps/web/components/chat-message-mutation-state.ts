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

function createMutationError(event: ChatMessageMutationLifecycleEvent): string | null {
  switch (event.status) {
    case "failed":
      return "메시지 변경을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "cancelled":
      return "메시지 변경이 취소되었습니다.";
    case "queued":
    case "sending":
    case "retry-waiting":
    case "completed":
      return null;
  }
}
