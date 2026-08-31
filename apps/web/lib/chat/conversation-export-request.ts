type RequestBackend = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PauseBackend = (delayMs: number, signal?: AbortSignal) => Promise<void>;

export type ConversationExportRetry = Readonly<{
  delayMs: number;
  retryCount: number;
}>;

type ConversationExportRetryOptions = Readonly<{
  onRetry?: (retry: ConversationExportRetry) => void;
  pauseBackend?: PauseBackend;
  requestBackend?: RequestBackend;
  retryDelaysMs?: readonly number[];
}>;

const DEFAULT_RETRY_DELAYS_MS = [100, 300, 1_000] as const;
const MAX_RETRY_AFTER_MS = 5_000;

export async function fetchConversationExportWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  options: ConversationExportRetryOptions = {},
): Promise<Response> {
  const requestBackend = options.requestBackend ?? fetch;
  const pauseBackend = options.pauseBackend ?? pause;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const signal = init.signal ?? undefined;
  let retryCount = 0;

  while (true) {
    signal?.throwIfAborted();

    let response: Response;
    try {
      response = await requestBackend(input, init);
    } catch (error) {
      if (signal?.aborted || retryCount >= retryDelaysMs.length) throw error;
      const delayMs = retryDelaysMs[retryCount] ?? 0;
      retryCount += 1;
      options.onRetry?.({ delayMs, retryCount });
      await pauseBackend(delayMs, signal);
      continue;
    }

    if (retryCount >= retryDelaysMs.length || !(await isRetryableResponse(response))) {
      return response;
    }

    const delayMs = retryDelay(response, retryDelaysMs[retryCount] ?? 0);
    await response.body?.cancel().catch(() => undefined);
    retryCount += 1;
    options.onRetry?.({ delayMs, retryCount });
    await pauseBackend(delayMs, signal);
  }
}

async function isRetryableResponse(response: Response): Promise<boolean> {
  if ([429, 502, 504].includes(response.status)) return true;
  if (response.status !== 503) return false;

  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return !isRecord(body) || body.retryable !== false;
}

function retryDelay(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (!retryAfter) return fallbackMs;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(fallbackMs, seconds * 1_000));
  }

  const retryAt = Date.parse(retryAfter);
  if (!Number.isFinite(retryAt)) return fallbackMs;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(fallbackMs, retryAt - Date.now()));
}

function pause(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
