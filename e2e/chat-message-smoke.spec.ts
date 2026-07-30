import { expect, test } from "@playwright/test";

const AUTH_COOKIE_NAME = "civic_ai_access_token";

test("임시 로그인부터 메시지 새로고침 복구까지 실제 채팅 흐름을 검증한다", async ({
  context,
  page,
}) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-${uniqueId}`;
  const message = `Playwright 메시지 ${uniqueId}`;

  await test.step("임시 로그인으로 HttpOnly 인증 쿠키를 발급한다", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "임시 로그인", exact: true }).click();

    await expect(page.getByRole("button", { name: "임시 로그인 완료" })).toBeDisabled();
    await expect(
      page.getByText("브라우저가 HttpOnly 쿠키를 보관하고 이후 채팅 요청에 자동으로 전달합니다."),
    ).toBeVisible();

    const authCookie = (await context.cookies()).find((cookie) => cookie.name === AUTH_COOKIE_NAME);

    expect(authCookie, `${AUTH_COOKIE_NAME} 쿠키가 발급되어야 합니다.`).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
  });

  await test.step("실제 REST command로 공개 채팅방을 만들고 방으로 진입한다", async () => {
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "채팅방", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "새 채팅방" }).click();
    await page.getByRole("textbox", { name: "방 이름" }).fill(roomName);
    await page.getByRole("button", { name: "채팅방 만들기" }).click();

    await expect(page).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
    await expect(page.getByRole("heading", { name: roomName })).toBeVisible();
  });

  const roomId = readRoomId(page.url());
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });

  await test.step("SharedWorker WebSocket 구독과 REST snapshot 준비를 기다린다", async () => {
    await expect(
      page.getByText("이 탭에서 실시간 채팅을 사용 중입니다.", { exact: true }),
    ).toBeVisible();
    await expect(messageInput).toBeEnabled();
  });

  await test.step("STOMP command로 메시지를 보내고 실시간 이벤트 수신을 확인한다", async () => {
    await messageInput.fill(message);
    await page.getByRole("button", { name: "전송", exact: true }).click();

    await expect(page.getByText("서버가 메시지를 접수했습니다.", { exact: true })).toBeVisible();
    await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
  });

  await test.step("새로고침 후 REST 메시지 이력으로 같은 메시지가 복구되는지 확인한다", async () => {
    const historyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
    );

    await page.reload();

    const response = await historyResponse;
    expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
    await expect(messageInput).toBeEnabled();
    await expect(messageLog.getByText(message, { exact: true })).toBeVisible();
  });
});

function readRoomId(url: string): string {
  const roomId = new URL(url).pathname.split("/").filter(Boolean).at(-1);

  if (!roomId) {
    throw new Error(`채팅방 URL에서 roomId를 찾지 못했습니다: ${url}`);
  }

  return roomId;
}
