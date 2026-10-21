import { expect, test } from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  findPublicRoomCard,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

test("방장은 이름과 설명을 수정하고 참여자는 실시간 반영만 받는다", async ({
  browser,
}, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const initialName = `e2e-settings-${uniqueId}`;
  const initialDescription = `설정 변경 전 설명 ${uniqueId}`;
  const updatedName = `e2e-settings-updated-${uniqueId}`;
  const updatedDescription = `설정 변경 후 설명\n두 번째 줄 ${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const memberContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();

  try {
    await test.step("방장이 설명이 있는 공개 채팅방을 만든다", async () => {
      await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-settings-owner-${uniqueId}`);
      await createRoomAndEnter(ownerPage, initialName, {
        description: initialDescription,
      });

      const roomInfoTrigger = ownerPage.getByRole("button", { name: "토론방 메뉴", exact: true });
      await roomInfoTrigger.click();

      const membershipDialog = ownerPage.getByRole("dialog", { name: "토론방 메뉴" });
      await expect(membershipDialog).toBeVisible();
      await expect(membershipDialog.getByText(initialDescription, { exact: true })).toBeVisible();
      await expect(membershipDialog.getByLabel("방 카테고리")).toContainText("정책");
      await expect(membershipDialog.getByRole("form", { name: "방 정보 수정" })).toBeVisible();
      await membershipDialog.getByRole("button", { name: "토론방 메뉴 닫기", exact: true }).click();
      await expect(membershipDialog).toHaveCount(0);
      await expect(roomInfoTrigger).toBeFocused();
    });

    const roomId = new URL(ownerPage.url()).pathname.split("/").at(-1);

    expect(roomId, "생성한 채팅방 URL에서 roomId를 읽을 수 있어야 합니다.").toBeTruthy();

    await test.step("일반 참여자는 방에 들어와도 방 정보 수정 form을 볼 수 없다", async () => {
      await authenticateLocalE2EUserAs(
        memberPage,
        memberContext,
        `e2e-settings-member-${uniqueId}`,
      );
      await memberPage.goto("/chat");

      const publicRoomCard = await findPublicRoomCard(memberPage, initialName);

      await expect(publicRoomCard.getByLabel("방 카테고리")).toContainText("정책");
      await joinPublicRoomAndEnter(memberPage, roomId!, initialName, { navigate: false });

      await memberPage.getByRole("button", { name: "토론방 메뉴", exact: true }).click();

      const membershipDialog = memberPage.getByRole("dialog", { name: "토론방 메뉴" });
      await expect(membershipDialog.getByText(initialDescription, { exact: true })).toBeVisible();
      await expect(membershipDialog.getByRole("form", { name: "방 정보 수정" })).toHaveCount(0);
      await membershipDialog.getByRole("button", { name: "토론방 메뉴 닫기", exact: true }).click();
    });

    await test.step("방장이 채팅방 메뉴 안에서 방 이름과 설명을 수정한다", async () => {
      await ownerPage.getByRole("button", { name: "토론방 메뉴", exact: true }).click();
      const membershipDialog = ownerPage.getByRole("dialog", { name: "토론방 메뉴" });

      const form = membershipDialog.getByRole("form", { name: "방 정보 수정" });

      await expect(form).toBeVisible();
      await expect(form.getByRole("textbox", { name: "방 이름" })).toHaveValue(initialName);
      await expect(form.getByRole("textbox", { name: "방 설명" })).toHaveValue(initialDescription);
      await expect(form.getByLabel("방 카테고리")).toHaveCount(0);
      await expect(form.getByRole("combobox")).toHaveCount(0);

      await form.getByRole("textbox", { name: "방 이름" }).fill(updatedName);
      await form.getByRole("textbox", { name: "방 설명" }).fill(updatedDescription);

      const updateResponse = ownerPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/commands/update-settings`,
      );

      await form.getByRole("button", { name: "저장", exact: true }).click();

      const response = await updateResponse;
      const requestBody = response.request().postDataJSON();

      expect(response.status()).toBe(200);
      expect(requestBody).toMatchObject({
        description: updatedDescription,
        name: updatedName,
      });
      expect(requestBody).not.toHaveProperty("categoryIds");
      expect(requestBody).not.toHaveProperty("visibility");
      expect(requestBody).not.toHaveProperty("joinPolicy");
      await expect(form).toBeVisible();
      await expect(
        membershipDialog.getByRole("status").filter({ hasText: "방 정보를 수정했습니다." }),
      ).toBeVisible();

      await expect(form.getByRole("textbox", { name: "방 이름" })).toHaveValue(updatedName);
      await form.getByRole("button", { name: "되돌리기", exact: true }).click();
      await membershipDialog.getByRole("button", { name: "토론방 메뉴 닫기", exact: true }).click();
    });

    await test.step("방장과 참여자 화면이 최신 설정 snapshot으로 수렴한다", async () => {
      for (const page of [ownerPage, memberPage]) {
        await expect(page.getByRole("heading", { name: updatedName, exact: true })).toBeVisible();
        await page.getByRole("button", { name: "토론방 메뉴", exact: true }).click();

        const membershipDialog = page.getByRole("dialog", { name: "토론방 메뉴" });
        await expect(membershipDialog.getByText(updatedDescription, { exact: true })).toBeVisible();
        await expect(membershipDialog.getByLabel("방 카테고리")).toContainText("지역 현안");
        await membershipDialog
          .getByRole("button", { name: "토론방 메뉴 닫기", exact: true })
          .click();
      }

      await expect(memberPage.getByRole("form", { name: "방 정보 수정" })).toHaveCount(0);
    });

    await test.step("카테고리와 공개 상태는 유지되고 목록에는 최신 이름이 반영된다", async () => {
      await ownerPage.goto("/chat");

      const myRoomCard = ownerPage
        .getByRole("list", { name: "참여 중인 토론방" })
        .getByRole("article")
        .filter({ hasText: updatedName });
      const publicRoomCard = ownerPage
        .getByRole("list", { name: "공개 토론방" })
        .getByRole("article")
        .filter({ hasText: updatedName });

      await expect(myRoomCard).toBeVisible();
      await expect(myRoomCard.getByLabel("방 카테고리")).toContainText("지역 현안");
      await expect(publicRoomCard).toBeVisible();
      await expect(publicRoomCard.getByLabel("방 카테고리")).toContainText("지역 현안");
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});
