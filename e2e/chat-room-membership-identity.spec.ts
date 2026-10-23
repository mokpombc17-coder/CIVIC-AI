import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

test("Room 관리와 메시지 작성자 판정을 membershipId 기반으로 처리한다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-membership-identity-${uniqueId}`;
  const ownerSubject = `e2e-membership-owner-${uniqueId}`;
  const memberSubject = `e2e-membership-member-${uniqueId}`;
  const ownerMessage = `membership owner message ${uniqueId}`;
  const memberMessage = `membership member message ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("서로 다른 사용자로 로그인하고 같은 Room에 참여한다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, ownerSubject);
      await authenticateLocalE2EUserAs(memberPage, memberContext, memberSubject);
    });

    const roomId =
      await test.step("방을 만들고 두 사용자의 메시지 작성자 UI를 확인한다", async () => {
        const createdRoomId = await createRoomAndEnter(ownerPage, roomName);
        await joinPublicRoomAndEnter(memberPage, createdRoomId, roomName);

        await ownerPage.getByRole("textbox", { name: "메시지" }).fill(ownerMessage);
        await ownerPage.getByRole("button", { name: "전송", exact: true }).click();
        await memberPage.getByRole("textbox", { name: "메시지" }).fill(memberMessage);
        await memberPage.getByRole("button", { name: "전송", exact: true }).click();

        const ownerLog = ownerPage.getByRole("log", { name: `${createdRoomId} 메시지` });
        const memberLog = memberPage.getByRole("log", { name: `${createdRoomId} 메시지` });
        const ownerMessageButton = ownerLog.getByRole("button", {
          name: ownerMessage,
          exact: true,
        });
        const ownerMessageOnMemberButton = memberLog.getByRole("button", {
          name: ownerMessage,
          exact: true,
        });
        const memberMessageOnOwnerButton = ownerLog.getByRole("button", {
          name: memberMessage,
          exact: true,
        });

        await expect(ownerMessageButton).toBeVisible();
        await expect(ownerMessageOnMemberButton).toBeVisible();
        await expect(memberMessageOnOwnerButton).toBeVisible();
        await expect(getMessageRow(memberLog, ownerMessage)).toContainText(ownerSubject);
        await expect(getMessageRow(ownerLog, memberMessage)).toContainText(memberSubject);

        await ownerMessageButton.click();
        const ownerActions = ownerPage.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
        await expect(ownerActions.getByRole("button", { name: "수정", exact: true })).toBeVisible();
        await ownerActions.getByRole("button", { name: "메시지 작업 닫기" }).click();

        await memberLog.getByRole("button", { name: ownerMessage, exact: true }).click();
        const memberActions = memberPage.getByRole("dialog", { name: /^메시지( 수정| 삭제)?$/ });
        await expect(memberActions.getByRole("button", { name: "수정", exact: true })).toHaveCount(
          0,
        );
        await expect(memberActions.getByRole("button", { name: "삭제", exact: true })).toHaveCount(
          0,
        );
        await memberActions.getByRole("button", { name: "메시지 작업 닫기" }).click();

        return createdRoomId;
      });

    await test.step("일반 참여자가 ACTIVE 프로필 목록과 자신의 Room 프로필을 확인한다", async () => {
      const dialog = await openMembershipDialog(memberPage);
      const ownerRow = dialog
        .getByText(ownerSubject, { exact: true })
        .locator("xpath=ancestor::li");
      const memberRow = dialog
        .getByText(memberSubject, { exact: true })
        .locator("xpath=ancestor::li");

      await expect(ownerRow).toBeVisible();
      await expect(memberRow).toBeVisible();
      await expect(
        ownerRow.getByRole("img", { name: `${ownerSubject} 기본 프로필 이미지` }),
      ).toBeVisible();
      await expect(
        memberRow.getByRole("img", { name: `${memberSubject} 기본 프로필 이미지` }),
      ).toBeVisible();
      await expect(memberRow.getByText("나", { exact: true })).toBeVisible();
      await expect(ownerRow.getByText("방장", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "차단", exact: true })).toHaveCount(0);

      await dialog.getByRole("button", { name: "토론방 메뉴 닫기" }).click();
    });

    await test.step("방장이 targetMembershipId로 참여자를 차단한다", async () => {
      const dialog = await openMembershipDialog(ownerPage);
      await expect(dialog.getByText(ownerSubject, { exact: true })).toBeVisible();
      await expect(dialog.getByText(memberSubject, { exact: true })).toBeVisible();

      const command = await executeMemberCommand(
        ownerPage,
        await openMemberActions(dialog, memberSubject).then((actions) =>
          actions.getByRole("button", { name: "차단", exact: true }),
        ),
        `/api/v1/rooms/${roomId}/commands/ban-member`,
      );
      const requestBody = readTargetMembershipRequest(command.requestBody);
      const responseBody = (await command.response.json()) as { targetMembershipId?: unknown };

      expect(responseBody.targetMembershipId).toBe(requestBody.targetMembershipId);
      await expectMemberBanned(dialog, memberSubject);
      await dialog.getByRole("button", { name: "토론방 메뉴 닫기" }).click();

      const ownerLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(getMessageRow(ownerLog, memberMessage)).toContainText("알 수 없음");
    });

    await test.step("방장이 targetMembershipId로 참여자의 차단을 해제한다", async () => {
      const dialog = await openMembershipDialog(ownerPage);

      const command = await executeMemberCommand(
        ownerPage,
        dialog.getByRole("button", { name: "차단 해제", exact: true }),
        `/api/v1/rooms/${roomId}/commands/unban-member`,
      );
      const requestBody = readTargetMembershipRequest(command.requestBody);
      const responseBody = (await command.response.json()) as { targetMembershipId?: unknown };

      expect(responseBody.targetMembershipId).toBe(requestBody.targetMembershipId);
      await expect(
        getMembershipSection(dialog, "차단된 사용자 관리").getByText("차단된 사용자가 없습니다.", {
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "토론방 메뉴 닫기" }).click();
    });

    await test.step("참여자가 재참여하고 방장이 targetMembershipId로 소유권을 넘긴다", async () => {
      await memberPage.goto("/chat");
      await joinPublicRoomAndEnter(memberPage, roomId, roomName, { navigate: false });

      const participantDialog = await openMembershipDialog(ownerPage);
      await expect(participantDialog.getByText(memberSubject, { exact: true })).toBeVisible();
      await participantDialog.getByRole("button", { name: "토론방 메뉴 닫기" }).click();
      const ownerLog = ownerPage.getByRole("log", { name: `${roomId} 메시지` });
      await expect(getMessageRow(ownerLog, memberMessage)).toContainText(memberSubject);
      const commandDialog = await openMembershipDialog(ownerPage);
      const command = await executeMemberCommand(
        ownerPage,
        await openMemberActions(commandDialog, memberSubject).then((actions) =>
          actions.getByRole("button", { name: "방장 위임", exact: true }),
        ),
        `/api/v1/rooms/${roomId}/commands/transfer-ownership`,
      );
      const requestBody = readTargetMembershipRequest(command.requestBody);
      const responseBody = (await command.response.json()) as { newOwnerMembershipId?: unknown };

      expect(responseBody.newOwnerMembershipId).toBe(requestBody.targetMembershipId);
      await expect(
        getMemberRow(getMembershipSection(commandDialog, "참여자"), memberSubject).getByText(
          "방장",
          { exact: true },
        ),
      ).toBeVisible();
    });

    await test.step("새 방장에게 owner control이 이동하고 fixture Room을 정리한다", async () => {
      const dialog = await openMembershipDialog(memberPage);
      await expect(dialog.getByRole("button", { name: "방 종료", exact: true })).toBeVisible();

      await executeMemberCommand(
        memberPage,
        await openMemberActions(dialog, ownerSubject).then((actions) =>
          actions.getByRole("button", { name: "차단", exact: true }),
        ),
        `/api/v1/rooms/${roomId}/commands/ban-member`,
      );
      await expectMemberBanned(dialog, ownerSubject);

      const closeResponsePromise = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/commands/close`,
      );
      memberPage.once("dialog", (confirmation) => confirmation.accept());
      await dialog.getByRole("button", { name: "방 종료", exact: true }).click();
      const closeResponse = await closeResponsePromise;

      expect(
        closeResponse.ok(),
        `Room 종료 요청이 성공해야 합니다: ${closeResponse.status()}`,
      ).toBe(true);
      await expect(memberPage).toHaveURL(/\/chat$/);
    });
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

async function openMembershipDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "토론방 메뉴" });

  if ((await dialog.count()) === 0) {
    await page.getByRole("button", { name: "토론방 메뉴", exact: true }).click();
  }

  await expect(dialog).toBeVisible();
  return dialog;
}

// 방장 위임과 차단은 참여자 행의 관리 메뉴 안에 있음
async function openMemberActions(dialog: Locator, displayName: string): Promise<Locator> {
  const memberRow = dialog.getByRole("listitem").filter({
    has: dialog.page().getByText(displayName, { exact: true }),
  });
  await memberRow.getByLabel(`${displayName} 관리`, { exact: true }).click();
  return memberRow;
}

async function executeMemberCommand(
  page: Page,
  button: Locator,
  pathname: string,
): Promise<{ requestBody: unknown; response: Response }> {
  // Network event의 postDataJSON은 비어 있을 수 있어 route에서 요청 본문을 읽음
  let requestBody: unknown = null;
  const isCommandRequest = (url: URL) => url.pathname === pathname;
  await page.route(isCommandRequest, async (route) => {
    requestBody = route.request().postDataJSON();
    await route.continue();
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === pathname,
  );

  page.once("dialog", (confirmation) => confirmation.accept());
  await button.click();

  const response = await responsePromise;
  await page.unroute(isCommandRequest);
  expect(response.ok(), `${pathname} 요청이 성공해야 합니다: ${response.status()}`).toBe(true);
  return { requestBody, response };
}

function getMembershipSection(dialog: Locator, heading: string): Locator {
  return dialog
    .getByRole("heading", { name: heading, exact: true })
    .locator("xpath=ancestor::section[1]");
}

function getMemberRow(section: Locator, displayName: string): Locator {
  return section.getByRole("listitem").filter({
    has: section.page().getByText(displayName, { exact: true }),
  });
}

// 명령 성공 안내는 화면에 보이지 않으므로 차단 결과는 참여자 목록과 차단된 사용자 목록이 바뀌는 것으로 확인함
async function expectMemberBanned(dialog: Locator, displayName: string): Promise<void> {
  await expect(
    getMemberRow(getMembershipSection(dialog, "차단된 사용자 관리"), displayName),
  ).toBeVisible();
  await expect(getMemberRow(getMembershipSection(dialog, "참여자"), displayName)).toHaveCount(0);
}

function readTargetMembershipRequest(requestBody: unknown): { targetMembershipId: string } {
  const body = requestBody as Record<string, unknown>;

  expect(Object.keys(body)).toEqual(["targetMembershipId"]);
  expect(body.targetMembershipId).toEqual(expect.any(String));
  expect(String(body.targetMembershipId)).not.toHaveLength(0);

  return { targetMembershipId: String(body.targetMembershipId) };
}

function getMessageRow(log: Locator, message: string): Locator {
  return log.getByRole("button", { name: message, exact: true }).locator("xpath=ancestor::li");
}
