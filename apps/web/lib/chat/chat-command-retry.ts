import { ChatApiError } from "./chat-fetch";

export function isRetryableChatCommandError(error: unknown): boolean {
  if (error instanceof ChatApiError) {
    return error.retryable;
  }

  return error instanceof TypeError;
}
