export const PWA_START_PATH = "/pwa/start";
export const PWA_MAIN_PATH = "/home";
export const PWA_LOGIN_PATH = "/login?returnTo=%2Fhome";
export const PWA_MINIMUM_SPLASH_MS = 1_500;

const PWA_REFRESH_PATH = "/api/v1/auth/refresh";

export type PwaSessionResult =
  | Readonly<{ status: "authenticated" }>
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{
      status: "retryable-error";
      reason: "offline" | "network" | "rate-limited" | "server" | "unexpected-response";
    }>;

type PwaSessionRequestOptions = Readonly<{
  online?: boolean;
  request?: typeof fetch;
}>;

type PwaSessionRunner = (online: boolean) => Promise<PwaSessionResult>;
type Pause = (delayMs: number) => Promise<void>;

/**
 * Main/Auth 계약 확정 전 임시 경계다. 실제 명세가 도착하면 요청 형식과 상태 코드 매핑만 이 함수에서
 * 확정한다. 토큰은 응답 본문으로 읽지 않고 BFF가 전달하는 HttpOnly Set-Cookie에 맡긴다.
 */
export async function requestPwaSession({
  online = true,
  request = fetch,
}: PwaSessionRequestOptions = {}): Promise<PwaSessionResult> {
  if (!online) {
    return { status: "retryable-error", reason: "offline" };
  }

  let response: Response;
  try {
    response = await request(PWA_REFRESH_PATH, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    return { status: "retryable-error", reason: "network" };
  }

  await response.body?.cancel().catch(() => undefined);
  if (response.ok) {
    return { status: "authenticated" };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: "unauthenticated" };
  }
  if (response.status === 429) {
    return { status: "retryable-error", reason: "rate-limited" };
  }
  if (response.status >= 500) {
    return { status: "retryable-error", reason: "server" };
  }
  return { status: "retryable-error", reason: "unexpected-response" };
}

export function createPwaSessionInitializer(
  run: PwaSessionRunner = (online) => requestPwaSession({ online }),
) {
  let inFlight: Promise<PwaSessionResult> | null = null;

  return (online: boolean): Promise<PwaSessionResult> => {
    if (!inFlight) {
      inFlight = run(online).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

const initializePwaSessionOnce = createPwaSessionInitializer();

export function initializePwaSession(online: boolean): Promise<PwaSessionResult> {
  return initializePwaSessionOnce(online);
}

export async function waitForMinimumPwaSplash(
  result: Promise<PwaSessionResult>,
  pause: Pause = delay,
): Promise<PwaSessionResult> {
  const [sessionResult] = await Promise.all([result, pause(PWA_MINIMUM_SPLASH_MS)]);
  return sessionResult;
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
