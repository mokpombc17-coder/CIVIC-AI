const HANGUL = /\p{Script=Hangul}/u;

export const DEFAULT_FAILURE_MESSAGE = "요청을 처리하지 못했습니다.";

/**
 * Server details and internal error text are written in English for operators. Only text that
 * is already Korean may reach the screen; anything else falls back to the screen's own copy.
 */
export function koreanMessage(message: string | null | undefined, fallback: string): string {
  return message && HANGUL.test(message) ? message : fallback;
}

/** The message of a caught error when it is Korean, otherwise the screen's fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  return koreanMessage(error instanceof Error ? error.message : null, fallback);
}

/** Korean copy for an HTTP failure whose server detail cannot be shown. */
export function statusMessage(status: number): string {
  if (status === 400 || status === 422) return "입력한 내용을 다시 확인해 주세요.";
  if (status === 404) return "요청한 정보를 찾을 수 없습니다.";
  if (status === 409) {
    return "다른 변경과 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  if (status >= 500) return "서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
  return DEFAULT_FAILURE_MESSAGE;
}
