import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";
const ACTIVE_ROOM_LABEL = "채팅 가능";
const CONNECTED_STATUS_SELECTOR = '[data-chat-connection-status="connected"]';
// 서버 설정값이라 바뀔 수 있으므로 환경 변수로 받음
const PRE_JOIN_VISIBLE_MESSAGE_COUNT = Number.parseInt(
  process.env.CHAT_E2E_PRE_JOIN_VISIBLE_MESSAGE_COUNT ?? "10",
  10,
);

test("신규 참여자는 참여 직전 메시지부터 보고 참여 이후 메시지를 복구한다", async ({
  browser,
}, testInfo) => {
  expect(PRE_JOIN_VISIBLE_MESSAGE_COUNT).toBeGreaterThan(0);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("visible");
  const ownerSubject = `e2e-owner-${uniqueId}`;
  const memberSubject = `e2e-member-${uniqueId}`;
  // 가장 오래된 1개는 보이는 범위 밖, 나머지 N개는 범위 안
  const beforeJoinMessages = Array.from(
    { length: PRE_JOIN_VISIBLE_MESSAGE_COUNT + 1 },
    (_, index) => `참여 전 메시지 ${index + 1} ${uniqueId}`,
  );
  const hiddenBeforeJoinMessage = beforeJoinMessages[0]!;
  const oldestVisibleBeforeJoinMessage = beforeJoinMessages[1]!;
  const latestBeforeJoinMessage = beforeJoinMessages.at(-1)!;
  const afterJoinMessage = `참여 후 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 플랫폼 사용자로 로그인하고 공개 채팅방을 만든다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId =
      await test.step("방장이 공개 채팅방을 만들고 실시간 구독을 준비한다", async () => {
        const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

        await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
        await expect(ownerPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

        return createdRoomId;
      });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("방장이 신규 사용자 참여 전에 메시지를 전송한다", async () => {
      for (const message of beforeJoinMessages) {
        await sendMessage(ownerPage, ownerMessageLog, message);
      }

      await expectMessagesStored(ownerContext.request, roomId, beforeJoinMessages);
    });

    await test.step("신규 사용자는 참여 직전 메시지를 가장 오래된 것부터 본다", async () => {
      await joinPublicRoomAndEnter(memberPage, roomId, roomName);

      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(
        memberMessageLog.getByText(oldestVisibleBeforeJoinMessage, { exact: true }),
      ).toBeInViewport();
      await expect(
        memberMessageLog.getByText(latestBeforeJoinMessage, { exact: true }),
      ).toBeVisible();
      await expect(
        memberMessageLog.getByText(hiddenBeforeJoinMessage, { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("참여 이후 메시지는 실시간으로 수신한다", async () => {
      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await scrollMessageLogToLatest(memberMessageLog);
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(afterJoinMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(memberMessageLog.getByText(afterJoinMessage, { exact: true })).toBeVisible();
      await expect(
        memberMessageLog.getByText(hiddenBeforeJoinMessage, { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("새로고침 후에도 참여 직전 메시지부터 REST 이력으로 복구한다", async () => {
      const historyResponse = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
      );

      await memberPage.reload();

      const response = await historyResponse;
      expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(
        memberMessageLog.getByText(hiddenBeforeJoinMessage, { exact: true }),
      ).toHaveCount(0);
      await expect(
        memberMessageLog.getByText(oldestVisibleBeforeJoinMessage, { exact: true }),
      ).toBeVisible();
      await expect(memberMessageLog.getByText(afterJoinMessage, { exact: true })).toBeVisible();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

test("재참여자는 재참여 직전 메시지부터 보고 4002 이후 다시 동기화한다", async ({
  browser,
}, testInfo) => {
  expect(PRE_JOIN_VISIBLE_MESSAGE_COUNT).toBeGreaterThan(0);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = createE2ERoomName("rejoin");
  const ownerSubject = `e2e-rejoin-owner-${uniqueId}`;
  const memberSubject = `e2e-rejoin-member-${uniqueId}`;
  const previousParticipationMessage = `첫 참여 구간 메시지 ${uniqueId}`;
  // 퇴장 중 메시지가 보이는 범위를 모두 채워 첫 참여 구간 메시지를 범위 밖으로 밀어냄
  const whileAwayMessages = Array.from(
    { length: PRE_JOIN_VISIBLE_MESSAGE_COUNT },
    (_, index) => `퇴장 중 메시지 ${index + 1} ${uniqueId}`,
  );
  const oldestWhileAwayMessage = whileAwayMessages[0]!;
  const latestWhileAwayMessage = whileAwayMessages.at(-1)!;
  const afterRejoinMessage = `재참여 후 메시지 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 플랫폼 사용자로 로그인하고 같은 공개 방에 참여한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId = await test.step("방을 만들고 두 사용자의 실시간 구독을 준비한다", async () => {
      const createdRoomId = await createRoomAndEnter(ownerPage, roomName);

      await expect(ownerPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();

      return createdRoomId;
    });
    const ownerMessageLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
    const memberMessageLog = memberPage.getByRole("log", { name: `${roomId} 메시지` });

    await test.step("첫 참여 구간의 메시지를 실시간으로 수신한다", async () => {
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(previousParticipationMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(
        ownerMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toBeVisible();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toBeVisible();
    });

    await test.step("참여자가 방을 나가면 4002 이후 공통 연결을 새로 준비한다", async () => {
      memberPage.once("dialog", (dialog) => dialog.accept());
      await memberPage.getByRole("button", { name: "토론방 메뉴", exact: true }).click();
      await memberPage.getByRole("button", { name: "방 나가기", exact: true }).click();

      await expect(memberPage).toHaveURL(/\/chat$/);
      await expect(memberPage.locator(CONNECTED_STATUS_SELECTOR)).toHaveCount(1);
    });

    await test.step("참여자가 퇴장한 동안 방장이 메시지를 전송한다", async () => {
      for (const message of whileAwayMessages) {
        await sendMessage(ownerPage, ownerMessageLog, message);
      }

      await expectMessagesStored(ownerContext.request, roomId, whileAwayMessages);
    });

    await test.step("같은 문서에서 재참여하면 이전 Query cache를 비우고 재참여 직전 메시지부터 본다", async () => {
      await joinPublicRoomAndEnter(memberPage, roomId, roomName, {
        navigate: false,
      });

      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();
      await expect(
        memberMessageLog.getByText(oldestWhileAwayMessage, { exact: true }),
      ).toBeInViewport();
      await expect(
        memberMessageLog.getByText(latestWhileAwayMessage, { exact: true }),
      ).toBeVisible();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("재참여 이후 메시지는 다시 실시간으로 수신한다", async () => {
      // 최신 위치에 있어야 새 메시지가 화면에 들어와 read-state PUT이 나감
      await scrollMessageLogToLatest(memberMessageLog);
      await setDocumentFocusState(memberPage, false);
      await ownerPage.getByRole("textbox", { name: "메시지" }).fill(afterRejoinMessage);
      await ownerPage.getByRole("button", { name: "전송", exact: true }).click();

      await expect(memberMessageLog.getByText(afterRejoinMessage, { exact: true })).toBeVisible();

      const readStateResponse = waitForReadState(memberPage, roomId);
      await setDocumentFocusState(memberPage, true);

      expect(
        (await readStateResponse).ok(),
        "재참여 lifecycle에서 새 메시지 read-state PUT이 성공해야 합니다.",
      ).toBe(true);
    });

    await test.step("새로고침 후에도 재참여 직전 메시지부터 복구한다", async () => {
      const historyResponse = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/messages`,
      );

      await memberPage.reload();

      const response = await historyResponse;
      expect(response.ok(), `메시지 이력 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
      await expect(memberPage.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("textbox", { name: "메시지" })).toBeEnabled();
      await expect(
        memberMessageLog.getByText(previousParticipationMessage, { exact: true }),
      ).toHaveCount(0);
      await expect(
        memberMessageLog.getByText(oldestWhileAwayMessage, { exact: true }),
      ).toBeVisible();
      await expect(memberMessageLog.getByText(afterRejoinMessage, { exact: true })).toBeVisible();
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});

async function sendMessage(page: Page, messageLog: Locator, content: string): Promise<void> {
  await page.getByRole("textbox", { name: "메시지" }).fill(content);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
}

// 화면 표시는 낙관적 전송이라 서버 확정 전에도 보이므로 참여 전에 서버 저장을 따로 기다림
// 확정 전에 참여하면 입장 시점 sequence가 앞당겨져 보이는 범위가 달라짐
async function expectMessagesStored(
  request: APIRequestContext,
  roomId: string,
  contents: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => {
      const response = await request.get(
        `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms/${roomId}/messages?limit=50`,
      );

      if (!response.ok()) {
        return [];
      }

      const body = (await response.json()) as { items: { content: string | null }[] };
      const storedContents = new Set(body.items.map((message) => message.content));

      return contents.filter((content) => !storedContents.has(content));
    }, "참여 전 메시지가 모두 서버에 저장되어야 합니다.")
    .toEqual([]);
}

async function scrollMessageLogToLatest(messageLog: Locator): Promise<void> {
  await messageLog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
}

async function setDocumentFocusState(page: Page, focused: boolean): Promise<void> {
  await page.evaluate((nextFocused) => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => nextFocused,
    });
    window.dispatchEvent(new Event(nextFocused ? "focus" : "blur"));
  }, focused);
}

function waitForReadState(page: Page, roomId: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "PUT" && url.pathname === `/api/v1/rooms/${roomId}/read-state`
    );
  });
}
