import { expect, test } from "@playwright/test";
import { authenticateDevUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

test("채팅방 생성 폼은 키보드로 열고 닫아도 논리적인 포커스를 유지한다", async ({
  context,
  page,
}) => {
  await authenticateDevUserAs(page, context, `e2e-room-list-keyboard-${crypto.randomUUID()}`);
  await page.goto("/chat");

  const createRoomButton = page.getByRole("button", { name: "채팅방 생성", exact: true });

  await createRoomButton.focus();
  await page.keyboard.press("Enter");

  const roomNameInput = page.getByRole("textbox", { name: "방 이름", exact: true });

  await expect(roomNameInput).toBeFocused();
  await expect(page.getByRole("button", { name: "작성 닫기", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.keyboard.press("Shift+Tab");

  const closeCreateRoomButton = page.getByRole("button", { name: "작성 닫기", exact: true });

  await expect(closeCreateRoomButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(createRoomButton).toBeFocused();
  await expect(roomNameInput).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(roomNameInput).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "방 설명" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "정책", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "환경", exact: true })).toBeFocused();
  await expect(page.getByRole("radio", { name: "환경", exact: true })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "공개 범위" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "참여 정책" })).toBeFocused();
  await page.keyboard.press("Tab");

  const cancelButton = page.getByRole("button", { name: "취소", exact: true });

  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(createRoomButton).toBeFocused();
  await expect(roomNameInput).toHaveCount(0);
});

test("참여 중인 방 목록은 제한된 높이 안에서 키보드로 탐색할 수 있다", async ({
  context,
  page,
}) => {
  await authenticateDevUserAs(page, context, `e2e-room-list-scroll-${crypto.randomUUID()}`);

  const roomName = `키보드 스크롤 방 ${crypto.randomUUID()}`;
  await createRoomAndEnter(page, roomName);
  await page.goto("/chat");

  const roomList = page.getByRole("list", { name: "참여 중인 채팅방" });

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
  const detailButton = roomList.getByRole("button", {
    name: `${roomName} 자세히 보기`,
    exact: true,
  });
  await expect(detailButton).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: roomName, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: roomName, exact: true })).toHaveCount(0);
  await expect(detailButton).toBeFocused();
});
