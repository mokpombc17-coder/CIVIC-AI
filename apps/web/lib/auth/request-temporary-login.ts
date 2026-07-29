export const TEMPORARY_LOGIN_SUBJECT = "local-user-1";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestTemporaryLogin(request: FetchRequest = fetch): Promise<void> {
  const response = await request("/api/dev/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: TEMPORARY_LOGIN_SUBJECT,
    }),
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`임시 로그인 요청에 실패했습니다. (HTTP ${response.status})`);
  }
}
