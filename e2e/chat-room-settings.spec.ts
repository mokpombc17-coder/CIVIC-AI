import { expect, test } from "@playwright/test";
import {
  authenticateDevUserAs,
  createRoomAndEnter,
  findPublicRoomCard,
  joinPublicRoomAndEnter,
} from "./chat-e2e-helpers";

test("방장은 설정을 변경하고 참여자는 실시간 반영만 받는다", async ({ browser }, testInfo) => {
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
      await authenticateDevUserAs(ownerPage, ownerContext, `e2e-settings-owner-${uniqueId}`);
      await createRoomAndEnter(ownerPage, initialName, {
        category: "LOCAL_ISSUE",
        description: initialDescription,
      });

      const roomInfoTrigger = ownerPage.getByRole("button", { name: "방 정보", exact: true });
      await roomInfoTrigger.click();

      const membershipDialog = ownerPage.getByRole("dialog", { name: "방 정보와 멤버십" });
      await expect(membershipDialog).toBeVisible();
      await expect(membershipDialog.getByText(initialDescription, { exact: true })).toBeVisible();
      await expect(membershipDialog.getByLabel("방 카테고리")).toContainText("지역 현안");
      await expect(
        membershipDialog.getByRole("button", { name: "방 설정", exact: true }),
      ).toBeVisible();
      await membershipDialog
        .getByRole("button", { name: "방 정보와 멤버십 닫기", exact: true })
        .click();
      await expect(membershipDialog).toHaveCount(0);
      await expect(roomInfoTrigger).toBeFocused();
    });

    const roomId = new URL(ownerPage.url()).pathname.split("/").at(-1);

    expect(roomId, "생성한 채팅방 URL에서 roomId를 읽을 수 있어야 합니다.").toBeTruthy();

    await test.step("일반 참여자는 방에 들어와도 설정 버튼을 볼 수 없다", async () => {
      await authenticateDevUserAs(memberPage, memberContext, `e2e-settings-member-${uniqueId}`);
      await memberPage.goto("/chat");

      const publicRoomCard = await findPublicRoomCard(memberPage, initialName);

      await expect(publicRoomCard.getByLabel("방 카테고리")).toContainText("지역 현안");
      await joinPublicRoomAndEnter(memberPage, roomId!, initialName, { navigate: false });

      await memberPage.getByRole("button", { name: "방 정보", exact: true }).click();

      const membershipDialog = memberPage.getByRole("dialog", { name: "방 정보와 멤버십" });
      await expect(membershipDialog.getByText(initialDescription, { exact: true })).toBeVisible();
      await expect(
        membershipDialog.getByRole("button", { name: "방 설정", exact: true }),
      ).toHaveCount(0);
      await membershipDialog
        .getByRole("button", { name: "방 정보와 멤버십 닫기", exact: true })
        .click();
    });

    await test.step("방장이 Dialog에서 전체 설정을 변경한다", async () => {
      await ownerPage.getByRole("button", { name: "방 정보", exact: true }).click();
      await ownerPage.getByRole("button", { name: "방 설정", exact: true }).click();

      const dialog = ownerPage.getByRole("dialog", { name: "방 설정 변경" });

      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "방 이름" })).toHaveValue(initialName);
      await expect(dialog.getByRole("textbox", { name: "방 설명" })).toHaveValue(
        initialDescription,
      );
      await expect(dialog.getByRole("radio", { name: "지역 현안", exact: true })).toBeChecked();

      await dialog.getByRole("textbox", { name: "방 이름" }).fill(updatedName);
      await dialog.getByRole("textbox", { name: "방 설명" }).fill(updatedDescription);
      await dialog.getByText("환경", { exact: true }).click();
      await dialog.getByRole("combobox", { name: "공개 범위" }).selectOption("UNLISTED");
      await dialog.getByRole("combobox", { name: "참여 정책" }).selectOption("INVITE_ONLY");

      const updateResponse = ownerPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/commands/update-settings`,
      );

      await dialog.getByRole("button", { name: "변경사항 저장", exact: true }).click();

      const response = await updateResponse;

      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).toMatchObject({
        categories: ["ENVIRONMENT"],
      });
      await expect(dialog).toBeHidden();
      await expect(
        ownerPage.getByRole("status").filter({ hasText: "방 설정을 변경했습니다." }),
      ).toBeVisible();

      await ownerPage.getByRole("button", { name: "방 설정", exact: true }).click();

      const reopenedDialog = ownerPage.getByRole("dialog", { name: "방 설정 변경" });

      await expect(reopenedDialog.getByRole("radio", { name: "환경", exact: true })).toBeChecked();
      await reopenedDialog.getByRole("button", { name: "방 설정 닫기", exact: true }).click();
      await ownerPage.getByRole("button", { name: "방 정보와 멤버십 닫기", exact: true }).click();
    });

    await test.step("방장과 참여자 화면이 최신 설정 snapshot으로 수렴한다", async () => {
      for (const page of [ownerPage, memberPage]) {
        await expect(page.getByRole("heading", { name: updatedName, exact: true })).toBeVisible();
        await page.getByRole("button", { name: "방 정보", exact: true }).click();

        const membershipDialog = page.getByRole("dialog", { name: "방 정보와 멤버십" });
        await expect(membershipDialog.getByText(updatedDescription, { exact: true })).toBeVisible();
        await expect(membershipDialog.getByLabel("방 카테고리")).toContainText("환경");
        await membershipDialog
          .getByRole("button", { name: "방 정보와 멤버십 닫기", exact: true })
          .click();
      }

      await expect(memberPage.getByRole("button", { name: "방 설정", exact: true })).toHaveCount(0);
    });

    await test.step("UNLISTED 방은 공개 목록에서 사라지고 내 방 목록에는 최신 이름이 남는다", async () => {
      await ownerPage.goto("/chat");

      const myRoomLink = ownerPage.getByRole("link").filter({ hasText: updatedName });
      const publicRoomCard = ownerPage.getByRole("article").filter({ hasText: updatedName });

      await expect(myRoomLink).toBeVisible();
      await expect(myRoomLink.getByLabel("방 카테고리")).toContainText("환경");
      await expect(publicRoomCard).toHaveCount(0);
    });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close()]);
  }
});
