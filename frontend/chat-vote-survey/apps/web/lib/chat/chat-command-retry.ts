import { ChatApiError } from "./chat-fetch";

export function isRetryableChatCommandError(error: unknown): boolean {
  if (error instanceof ChatApiError) {
    return error.retryable;
  }

  return error instanceof TypeError;
}

export function selectRetryableChatCommand<TCommand>(
  command: TCommand | null,
  error: unknown,
): TCommand | null {
  if (command === null || !isRetryableChatCommandError(error)) {
    return null;
  }

  return command;
}
