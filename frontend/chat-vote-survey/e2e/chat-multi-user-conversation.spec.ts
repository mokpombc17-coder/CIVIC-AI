import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const DEMO_DELAY_MS = readDemoDelay();

test("세 사용자가 같은 채팅방에서 실시간으로 대화한다", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("시민 교통 대화");
  const ownerContext = await browser.newContext({ baseURL });
  const firstMemberContext = await browser.newContext({ baseURL });
  const secondMemberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const firstMemberPage = await firstMemberContext.newPage();
  const secondMemberPage = await secondMemberContext.newPage();

  try {
    await test.step("세 사용자가 서로 다른 계정으로 로그인한다", async () => {
      await authenticateLocalE2EUserAs(
        ownerPage,
        ownerContext,
        `e2e-conversation-owner-${uniqueId}`,
      );
      await authenticateLocalE2EUserAs(
        firstMemberPage,
        firstMemberContext,
        `e2e-conversation-member-a-${uniqueId}`,
      );
      await authenticateLocalE2EUserAs(
        secondMemberPage,
        secondMemberContext,
        `e2e-conversation-member-b-${uniqueId}`,
      );
    });

    const roomId = await test.step("방장이 채팅방을 만들고 두 참여자가 입장한다", async () => {
      const createdRoomId = await createRoomAndEnter(ownerPage, roomName, {
        description: "여러 시민이 지역 교통 개선 의견을 나누는 E2E 대화방입니다.",
      });
      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

      await joinPublicRoomAndEnter(firstMemberPage, createdRoomId, roomName);
      await expect(firstMemberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

      await joinPublicRoomAndEnter(secondMemberPage, createdRoomId, roomName);
      await expect(secondMemberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

      return createdRoomId;
    });

    const pages = [ownerPage, firstMemberPage, secondMemberPage] as const;
    const messageLogs = pages.map((page) => page.getByRole("log", { name: `${roomId} 메시지` }));

    await test.step("방장이 대화를 시작하고 모든 사용자가 메시지를 받는다", () =>
      sendConversationTurn(
        ownerPage,
        messageLogs,
        "안녕하세요. 오늘은 지역 교통 개선에 대해 이야기해 볼까요?",
      ));

    await test.step("첫 번째 참여자가 버스 배차 의견을 보낸다", () =>
      sendConversationTurn(
        firstMemberPage,
        messageLogs,
        "좋아요. 출퇴근 시간 버스 배차를 먼저 늘리면 좋겠어요.",
      ));

    await test.step("두 번째 참여자가 자전거 도로 의견을 보낸다", () =>
      sendConversationTurn(
        secondMemberPage,
        messageLogs,
        "저는 자전거 도로 연결도 함께 검토했으면 합니다.",
      ));

    await test.step("방장이 두 의견을 확인하고 대화를 마무리한다", () =>
      sendConversationTurn(
        ownerPage,
        messageLogs,
        "두 의견을 정리해서 교통 정책 제안으로 남겨볼게요.",
      ));

    await pauseForDemo(ownerPage, 3);
  } finally {
    await Promise.all([
      ownerContext.close(),
      firstMemberContext.close(),
      secondMemberContext.close(),
    ]);
  }
});

async function sendConversationTurn(
  senderPage: Page,
  messageLogs: readonly Locator[],
  content: string,
): Promise<void> {
  await senderPage.bringToFront();

  const messageInput = senderPage.getByRole("textbox", { name: "메시지" });
  await expect(messageInput).toBeEnabled();
  await messageInput.fill(content);
  await pauseForDemo(senderPage);
  await senderPage.getByRole("button", { name: "전송", exact: true }).click();

  await Promise.all(
    messageLogs.map((messageLog) =>
      expect(messageLog.getByText(content, { exact: true })).toBeVisible(),
    ),
  );
  await Promise.all(
    messageLogs.map((messageLog) =>
      expect(
        messageLog.locator("li[data-delivery-status]").filter({ hasText: content }),
      ).toHaveCount(0),
    ),
  );
  await pauseForDemo(senderPage);
}

async function pauseForDemo(page: Page, multiplier = 1): Promise<void> {
  if (DEMO_DELAY_MS > 0) {
    await page.waitForTimeout(DEMO_DELAY_MS * multiplier);
  }
}

function readDemoDelay(): number {
  const value = Number(process.env.CHAT_E2E_DEMO_DELAY_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 2_000) : 0;
}
