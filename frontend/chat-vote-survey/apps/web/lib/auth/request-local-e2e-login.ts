export const DEFAULT_LOCAL_E2E_AUTH_SUBJECT = "local-user-1";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestLocalE2ELogin(request: FetchRequest = fetch): Promise<void> {
  const response = await request("/api/dev/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: DEFAULT_LOCAL_E2E_AUTH_SUBJECT,
    }),
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`로컬 E2E 로그인 요청에 실패했습니다. (HTTP ${response.status})`);
  }
}
