import { expect, test, type Locator } from "@playwright/test";
import { authenticateLocalE2EUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

test("토론방 생성 sheet는 키보드로 열고 닫아도 논리적인 포커스를 유지한다", async ({
  context,
  page,
}) => {
  await authenticateLocalE2EUserAs(page, context, `e2e-room-list-keyboard-${crypto.randomUUID()}`);
  await page.goto("/chat");

  const createRoomButton = page.getByRole("button", { name: "토론방 생성 요청", exact: true });
  const createRoomSheet = page.getByRole("dialog", { name: "토론방 생성", exact: true });
  const roomNameInput = createRoomSheet.getByRole("textbox", { name: "제목", exact: true });
  const descriptionInput = createRoomSheet.getByRole("textbox", { name: "상세 설명", exact: true });
  const closeButton = createRoomSheet.getByRole("button", {
    name: "토론방 생성 닫기",
    exact: true,
  });

  // hydration 전 Enter는 무시되므로 sheet가 열릴 때까지 다시 누름
  await expect(async () => {
    await createRoomButton.focus();
    await page.keyboard.press("Enter");
    await expect(createRoomSheet).toBeVisible({ timeout: 1_000 });
  }).toPass();

  await expect(roomNameInput).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(descriptionInput).toBeFocused();

  // sheet 안의 focus 대상이 화면 상태에 따라 달라도 Tab 순환은 sheet 밖으로 나가지 않아야 함
  for (const key of [
    "Tab",
    "Tab",
    "Tab",
    "Tab",
    "Tab",
    "Tab",
    "Shift+Tab",
    "Shift+Tab",
    "Shift+Tab",
  ]) {
    await page.keyboard.press(key);
    await expect
      .poll(() => isFocusInside(createRoomSheet), `${key} 뒤에도 focus가 sheet 안에 있어야 합니다.`)
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(createRoomSheet).toHaveCount(0);
  await expect(createRoomButton).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(roomNameInput).toBeFocused();

  await closeButton.focus();
  await page.keyboard.press("Enter");
  await expect(createRoomSheet).toHaveCount(0);
  await expect(createRoomButton).toBeFocused();
});

test("참여 중인 방 목록은 제한된 높이 안에서 키보드로 탐색할 수 있다", async ({
  context,
  page,
}) => {
  await authenticateLocalE2EUserAs(page, context, `e2e-room-list-scroll-${crypto.randomUUID()}`);

  const roomName = `키보드 스크롤 방 ${crypto.randomUUID()}`;
  await createRoomAndEnter(page, roomName);
  await page.goto("/chat");

  const roomList = page.getByRole("list", { name: "참여 중인 토론방" });

  await expect(roomList).toBeVisible();
  await expect(roomList).toHaveAttribute("tabindex", "0");

  const scrollStyles = await roomList.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      maxHeight: styles.maxHeight,
      overflowY: styles.overflowY,
    };
  });

  expect(scrollStyles.overflowY).toBe("auto");
  expect(Number.parseFloat(scrollStyles.maxHeight)).toBeGreaterThan(0);

  await roomList.focus();
  await expect(roomList).toBeFocused();
  await page.keyboard.press("Tab");
  const roomLink = roomList.getByRole("link", {
    name: `${roomName} 토론방 입장`,
    exact: true,
  });
  await expect(roomLink).toBeFocused();

  await page.keyboard.press("Tab");
  const detailButton = roomList.getByRole("button", {
    name: `${roomName} 상세 정보 보기`,
    exact: true,
  });
  await expect(detailButton).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: roomName, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: roomName, exact: true })).toHaveCount(0);
  await expect(detailButton).toBeFocused();
});

async function isFocusInside(container: Locator): Promise<boolean> {
  return container.evaluate((element) => element.contains(document.activeElement));
}
