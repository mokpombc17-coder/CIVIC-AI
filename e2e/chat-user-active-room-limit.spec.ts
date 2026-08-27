import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { authenticateLocalE2EUserAs, findPublicRoomCard } from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";
const ACTIVE_ROOM_LIMIT = Number.parseInt(process.env.CHAT_E2E_USER_ACTIVE_ROOM_LIMIT ?? "20", 10);
const USER_ACTIVE_ROOM_LIMIT_MESSAGE =
  "참여 가능한 채팅방 수를 모두 사용했어요. 다른 참여 방에서 나간 뒤 다시 시도해 주세요.";

test("사용자별 ACTIVE Room quota는 CREATE와 JOIN을 거절하고 새 operation은 새 key를 사용한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  expect(ACTIVE_ROOM_LIMIT).toBeGreaterThan(1);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const candidateContext = await browser.newContext({ baseURL });
  const ownerContext = await browser.newContext({ baseURL });
  const candidatePage = await candidateContext.newPage();
  const ownerPage = await ownerContext.newPage();

  try {
    await authenticateLocalE2EUserAs(
      candidatePage,
      candidateContext,
      `e2e-active-room-candidate-${uniqueId}`,
    );
    await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-active-room-owner-${uniqueId}`);

    const targetRoom = await createRoomViaApi(
      ownerContext.request,
      `e2e-active-room-target-${uniqueId}`,
    );
    const candidateRoomIds: string[] = [];

    await test.step("사용자의 ACTIVE Room quota를 실제 Room 생성으로 채운다", async () => {
      for (let index = 0; index < ACTIVE_ROOM_LIMIT; index += 1) {
        const room = await createRoomViaApi(
          candidateContext.request,
          `e2e-active-room-seed-${uniqueId}-${index}`,
        );
        candidateRoomIds.push(room.roomId);
      }
    });

    await test.step("CREATE quota 거절, replay와 새 operation 성공을 확인한다", async () => {
      const roomName = `e2e-active-room-create-${uniqueId}`;
      await openCreateRoomForm(candidatePage, roomName);

      const createButton = candidatePage.getByRole("button", {
        name: "채팅방 만들기",
        exact: true,
      });
      const firstResponse = await clickCreateAndWaitForResponse(candidatePage, createButton);
      await expectUserActiveRoomLimitResponse(firstResponse, false);

      const form = candidatePage.locator("#create-room-form");
      await expect(form).toBeVisible();
      await expect(form.getByRole("alert")).toContainText(USER_ACTIVE_ROOM_LIMIT_MESSAGE);
      await expect(createButton).toBeEnabled();
      await expect(
        form.getByRole("button", { name: "같은 요청으로 다시 시도", exact: true }),
      ).toHaveCount(0);
      await expect(candidatePage).toHaveURL(/\/chat$/);

      const firstKey = readIdempotencyKey(firstResponse);
      const replayResponse = await candidateContext.request.post(createRoomUrl(), {
        data: firstResponse.request().postDataJSON(),
        headers: {
          "Idempotency-Key": firstKey,
        },
      });
      await expectUserActiveRoomLimitResponse(replayResponse, true);

      await closeRoomViaApi(candidateContext.request, candidateRoomIds.shift()!);

      const successResponse = await clickCreateAndWaitForResponse(candidatePage, createButton);
      expect(successResponse.status()).toBe(201);
      expect(readIdempotencyKey(successResponse)).not.toBe(firstKey);
      await expect(candidatePage).toHaveURL(/\/chat\/[A-Za-z0-9_-]+$/);
      await expect(
        candidatePage.getByRole("heading", { name: roomName, exact: true }),
      ).toBeVisible();
    });

    await test.step("JOIN quota 거절, replay와 새 operation 성공을 확인한다", async () => {
      await candidatePage.goto("/chat");
      const roomCard = await findPublicRoomCard(candidatePage, targetRoom.name);
      await roomCard
        .getByRole("button", { name: `${targetRoom.name} 자세히 보기`, exact: true })
        .click();
      const roomDetail = candidatePage.getByRole("dialog", {
        name: targetRoom.name,
        exact: true,
      });
      const joinButton = roomDetail.getByRole("button", { name: "참여하기", exact: true });

      const firstResponse = await clickJoinAndWaitForResponse(
        candidatePage,
        targetRoom.roomId,
        joinButton,
      );
      await expectUserActiveRoomLimitResponse(firstResponse, false);

      await expect(roomDetail.getByRole("alert")).toHaveText(USER_ACTIVE_ROOM_LIMIT_MESSAGE);
      await expect(joinButton).toBeEnabled();
      await expect(
        roomDetail.getByRole("button", { name: "같은 요청으로 다시 시도", exact: true }),
      ).toHaveCount(0);

      const firstKey = readIdempotencyKey(firstResponse);
      const replayResponse = await candidateContext.request.post(createJoinUrl(targetRoom.roomId), {
        headers: {
          "Idempotency-Key": firstKey,
        },
      });
      await expectUserActiveRoomLimitResponse(replayResponse, true);

      await closeRoomViaApi(candidateContext.request, candidateRoomIds.shift()!);

      const successResponse = await clickJoinAndWaitForResponse(
        candidatePage,
        targetRoom.roomId,
        joinButton,
      );
      expect(successResponse.status()).toBe(201);
      expect(readIdempotencyKey(successResponse)).not.toBe(firstKey);
      await expect(candidatePage).toHaveURL(new RegExp(`/chat/${targetRoom.roomId}$`));
      await expect(
        candidatePage.getByRole("heading", { name: targetRoom.name, exact: true }),
      ).toBeVisible();
    });
  } finally {
    await Promise.all([candidateContext.close(), ownerContext.close()]);
  }
});

async function openCreateRoomForm(page: Page, roomName: string): Promise<void> {
  await page.goto("/chat");
  await page.getByRole("button", { name: "채팅방 생성", exact: true }).click();
  const form = page.locator("#create-room-form");
  await form.getByRole("textbox", { name: "방 이름", exact: true }).fill(roomName);
  await form.getByText("정책", { exact: true }).click();
}

async function clickCreateAndWaitForResponse(page: Page, createButton: Locator): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/rooms",
  );

  await createButton.click();
  return responsePromise;
}

async function clickJoinAndWaitForResponse(
  page: Page,
  roomId: string,
  joinButton: Locator,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/v1/rooms/${roomId}/commands/join`,
  );

  await joinButton.click();
  return responsePromise;
}

async function createRoomViaApi(
  request: APIRequestContext,
  name: string,
): Promise<{ name: string; roomId: string }> {
  const response = await request.post(createRoomUrl(), {
    data: {
      name,
      description: "사용자별 ACTIVE Room quota E2E fixture",
      categories: ["POLICY"],
      visibility: "LISTED",
      joinPolicy: "OPEN",
    },
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
  });

  expect(response.status(), `${name} Room fixture 생성이 성공해야 합니다.`).toBe(201);
  const body = (await response.json()) as { roomId?: unknown };
  expect(typeof body.roomId).toBe("string");

  return { name, roomId: body.roomId as string };
}

async function closeRoomViaApi(request: APIRequestContext, roomId: string): Promise<void> {
  const response = await request.post(
    `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms/${roomId}/commands/close`,
    {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    },
  );

  expect(response.status(), `${roomId} Room 종료가 성공해야 합니다.`).toBe(200);
}

async function expectUserActiveRoomLimitResponse(
  response: APIResponse | Response,
  replayed: boolean,
): Promise<void> {
  expect(response.status()).toBe(409);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({
    type: "urn:hamcheeze:problem:user-active-room-limit-exceeded",
    title: "Room command rejected",
    status: 409,
    detail: "The user has reached the active room limit.",
    code: "USER_ACTIVE_ROOM_LIMIT_EXCEEDED",
    replayed,
    retryable: false,
  });
}

function readIdempotencyKey(response: Response): string {
  const idempotencyKey = response.request().headers()["idempotency-key"];

  expect(idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  return idempotencyKey;
}

function createRoomUrl(): string {
  return `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms`;
}

function createJoinUrl(roomId: string): string {
  return `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms/${roomId}/commands/join`;
}
