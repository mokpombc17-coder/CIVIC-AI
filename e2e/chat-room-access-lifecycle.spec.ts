import { expect, test, type Request } from "@playwright/test";
import { authenticateLocalE2EUserAs, createRoomAndEnter } from "./chat-e2e-helpers";

const ACTIVE_ROOM_LABEL = "채팅 가능";
const CLOSED_ROOM_LABEL = "종료된 토론방입니다.";

test("종료된 방은 지난 대화를 조회하지 않고 종료 안내만 표시한다", async ({
  context,
  page,
}) => {
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-room-closed-${uniqueId}`;
  const sentMessage = `종료 전에 보낸 메시지 ${uniqueId}`;

  await test.step("방장으로 로그인하고 공개 방에서 메시지를 보낸다", async () => {
    await authenticateLocalE2EUserAs(page, context, `e2e-close-owner-${uniqueId}`);
  });

  const roomId = await createRoomAndEnter(page, roomName);

  await test.step("방장이 메시지를 보낸 뒤 실제 방 종료 Command를 실행한다", async () => {
    await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "메시지" }).fill(sentMessage);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(page.getByText(sentMessage, { exact: true })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "토론방 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "방 종료", exact: true }).click();

    await expect(page).toHaveURL(/\/chat$/);
  });

  await test.step("종료된 방을 다시 열면 이력 조회 없이 종료 안내와 읽기 전용 상태를 표시한다", async () => {
    const messageHistoryRequests: string[] = [];
    const recordMessageHistoryRequest = (request: Request) => {
      const url = new URL(request.url());

      if (request.method() === "GET" && url.pathname === `/api/v1/rooms/${roomId}/messages`) {
        messageHistoryRequests.push(url.toString());
      }
    };
    page.on("request", recordMessageHistoryRequest);

    await page.goto(`/chat/${roomId}`);

    await expect(page.getByText("종료됨", { exact: true })).toBeVisible();
    await expect(page.getByText(CLOSED_ROOM_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByText(sentMessage, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/구독을 연결할 수 없습니다/)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "메시지" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(`/chat/${roomId}$`));
    expect(messageHistoryRequests, "종료된 방은 메시지 이력을 조회하지 않아야 합니다.").toEqual([]);

    page.off("request", recordMessageHistoryRequest);
  });
});
