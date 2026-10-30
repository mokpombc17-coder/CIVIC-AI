const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";

type HealthResponse = Readonly<{
  status?: unknown;
}>;

export default async function globalSetup(): Promise<void> {
  const healthUrl = new URL("/actuator/health", CHAT_RESOURCE_SERVER_URL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(healthUrl, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as HealthResponse;

    if (body.status !== "UP") {
      throw new Error(`health status가 UP이 아닙니다: ${String(body.status)}`);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);

    throw new Error(
      `Chat Resource Server가 준비되지 않았습니다. ${healthUrl.toString()} 확인에 실패했습니다: ${detail}`,
      { cause },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
