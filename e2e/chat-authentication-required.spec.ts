import { expect, test } from "@playwright/test";
import {
  authenticateLocalE2EUser,
  createRoomAndEnter,
  waitForLocalE2EAuthenticationSessionResponse,
} from "./chat-e2e-helpers";
import {
  closeSharedWorkerWebSockets,
  findNewSharedWorkerTargetId,
} from "./chat-shared-worker-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const AUTH_COOKIE_NAME = "civic_ai_access_token";
const AUTHENTICATION_REQUIRED_LABEL = "로그인 필요";
const AUTHENTICATION_REQUIRED_MESSAGE =
  "채팅 연결 인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.";
const AUTHENTICATION_REQUIRED_TITLE = "채팅을 계속하려면 로그인이 필요합니다.";
const AUTHENTICATION_REQUIRED_E2E_ENABLED = process.env.CHAT_E2E_AUTHENTICATION_REQUIRED === "true";
const RECONNECT_DELAY_GUARD_MS = 4_000;

test.skip(
  !AUTHENTICATION_REQUIRED_E2E_ENABLED,
  "백엔드 AUTHENTICATION_REQUIRED STOMP ERROR 계약이 준비되면 CHAT_E2E_AUTHENTICATION_REQUIRED=true로 실행합니다.",
);

test("인증 실패는 terminal 상태를 유지하고 로컬 E2E 로그인 성공 후에만 재연결한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const browserSession = await browser.newBrowserCDPSession();
  const existingSharedWorkerTargetIds = new Set(
    (await browserSession.send("Target.getTargets")).targetInfos
      .filter((target) => target.type === "shared_worker")
      .map((target) => target.targetId),
  );
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await test.step("유효한 로컬 E2E 로그인으로 채팅방 실시간 연결을 활성화한다", async () => {
      await authenticateLocalE2EUser(
        page,
        context,
        `e2e-authentication-required-${crypto.randomUUID()}`,
      );
      await createRoomAndEnter(page, `e2e-authentication-required-${crypto.randomUUID()}`);

      await expect(page.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "메시지" })).toBeEnabled();
    });

    const targetId = await findNewSharedWorkerTargetId(
      browserSession,
      existingSharedWorkerTargetIds,
    );
    const attachedTarget = await browserSession.send("Target.attachToTarget", {
      targetId,
      flatten: false,
    });

    await test.step("인증 쿠키가 없는 상태에서 SharedWorker WebSocket 재연결을 유도한다", async () => {
      await context.clearCookies({ name: AUTH_COOKIE_NAME });
      await expect
        .poll(async () =>
          (await context.cookies()).some((cookie) => cookie.name === AUTH_COOKIE_NAME),
        )
        .toBe(false);

      await closeSharedWorkerWebSockets(browserSession, attachedTarget.sessionId);
    });

    const authenticationAlert = page.getByRole("alert").filter({
      hasText: AUTHENTICATION_REQUIRED_TITLE,
    });

    await test.step("STOMP 인증 ERROR를 로그인 필요 상태로 표시한다", async () => {
      await expect(
        page.getByRole("status").filter({ hasText: AUTHENTICATION_REQUIRED_LABEL }),
      ).toBeVisible();
      await expect(authenticationAlert).toContainText(AUTHENTICATION_REQUIRED_MESSAGE);
      await expect(authenticationAlert.getByRole("button", { name: "다시 연결" })).toHaveCount(0);

      const composer = page.getByRole("textbox", { name: "메시지" });
      await expect(composer).toBeDisabled();
      await expect(composer).toHaveAttribute(
        "placeholder",
        "로그인 후 메시지를 입력할 수 있습니다.",
      );
    });

    await test.step("후속 close와 기본 재연결 지연이 terminal 인증 상태를 덮지 않는다", async () => {
      await page.waitForTimeout(RECONNECT_DELAY_GUARD_MS);

      await expect(authenticationAlert).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: AUTHENTICATION_REQUIRED_LABEL }),
      ).toBeVisible();
      await expect(
        page.getByText("실시간 연결: 다른 환경에서 연결됨", { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("로컬 E2E 로그인 성공 이벤트가 명시적으로 실시간 연결을 복구한다", async () => {
      const loginResponse = waitForLocalE2EAuthenticationSessionResponse(page);

      await page.getByRole("button", { name: /^로컬 E2E 로그인(?: 다시)? 갱신$/ }).click();
      expect((await loginResponse).status()).toBe(204);

      await expect(page.getByRole("status").filter({ hasText: ACTIVE_ROOM_LABEL })).toBeVisible();
      await expect(authenticationAlert).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "메시지" })).toBeEnabled();
    });
  } finally {
    await context.close();
    await browserSession.detach();
  }
});
