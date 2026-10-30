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
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  findPublicRoomCard,
} from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";
const ACTIVE_ROOM_LIMIT = Number.parseInt(process.env.CHAT_E2E_USER_ACTIVE_ROOM_LIMIT ?? "20", 10);
const USER_ACTIVE_ROOM_LIMIT_MESSAGE =
  "참여 가능한 토론방 수를 모두 사용했어요. 다른 참여 방에서 나간 뒤 다시 시도해 주세요.";

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
      const roomName = createE2ERoomName("act-room");
      await openCreateRoomForm(candidatePage, roomName);

      const createButton = candidatePage.getByRole("button", {
        name: "요청하기",
        exact: true,
      });
      const { requestBody: firstRequestBody, response: firstResponse } =
        await clickCreateAndWaitForResponse(candidatePage, createButton);
      await expectUserActiveRoomLimitResponse(firstResponse, false, ROOM_CREATION_REJECTED_TITLE);

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
        data: firstRequestBody,
        headers: {
          "Idempotency-Key": firstKey,
        },
      });
      // 생성 요청은 같은 key로 다시 보내면 저장된 응답 대신 남아 있는 요청을 다시 승인 시도하므로 replayed가 false임
      await expectUserActiveRoomLimitResponse(replayResponse, false, ROOM_CREATION_REJECTED_TITLE);

      await closeRoomViaApi(candidateContext.request, candidateRoomIds.shift()!);

      const { response: successResponse } = await clickCreateAndWaitForResponse(
        candidatePage,
        createButton,
      );
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
        .getByRole("button", { name: `${targetRoom.name} 참여하기`, exact: true })
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
      await expectUserActiveRoomLimitResponse(firstResponse, false, ROOM_COMMAND_REJECTED_TITLE);

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
      await expectUserActiveRoomLimitResponse(replayResponse, true, ROOM_COMMAND_REJECTED_TITLE);

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
  await page.getByRole("button", { name: "토론방 생성 요청", exact: true }).click();
  const form = page.locator("#create-room-form");
  await form.getByRole("textbox", { name: "제목" }).fill(roomName);
  await form
    .getByRole("textbox", { name: "상세 설명" })
    .fill(`${roomName} E2E 테스트용 설명입니다.`);
}

async function clickCreateAndWaitForResponse(
  page: Page,
  createButton: Locator,
): Promise<{ requestBody: unknown; response: Response }> {
  // Network event의 postDataJSON은 비어 있을 수 있어 route에서 요청 본문을 읽음
  let requestBody: unknown = null;
  const isCreateRequest = (url: URL) => url.pathname === "/api/v1/rooms";
  await page.route(isCreateRequest, async (route) => {
    if (route.request().method() === "POST") {
      requestBody = route.request().postDataJSON();
    }
    await route.continue();
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/rooms",
  );

  await createButton.click();
  const response = await responsePromise;
  await page.unroute(isCreateRequest);
  return { requestBody, response };
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
      categoryIds: ["00000000-0000-4000-8000-000000000001"],
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

const ROOM_CREATION_REJECTED_TITLE = "Room creation request failed";
const ROOM_COMMAND_REJECTED_TITLE = "Room command rejected";

async function expectUserActiveRoomLimitResponse(
  response: APIResponse | Response,
  replayed: boolean,
  title: string,
): Promise<void> {
  expect(response.status()).toBe(409);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({
    type: "urn:hamcheeze:problem:user-active-room-limit-exceeded",
    title,
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
