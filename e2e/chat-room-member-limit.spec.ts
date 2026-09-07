import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createRoomAndEnter,
  findPublicRoomCard,
  issueLocalE2EAuthenticationSession,
} from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";
const ACTIVE_MEMBER_LIMIT = 50;
const ROOM_MEMBER_LIMIT_MESSAGE = "참여 인원이 가득 찬 채팅방입니다.";

test("정원이 가득 찬 방은 참여를 거절하고 새 클릭에는 새 Idempotency-Key를 사용한다", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const roomName = `e2e-member-limit-${uniqueId}`;
  const ownerContext = await browser.newContext({ baseURL });
  const candidateContext = await browser.newContext({ baseURL });
  const ownerPage = await ownerContext.newPage();
  const candidatePage = await candidateContext.newPage();

  try {
    await authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-limit-owner-${uniqueId}`);
    const roomId = await createRoomAndEnter(ownerPage, roomName);

    await test.step("OWNER를 포함해 ACTIVE 참여 인원을 정원까지 채운다", async () => {
      for (let index = 1; index < ACTIVE_MEMBER_LIMIT; index += 1) {
        const subject = `e2e-limit-member-${uniqueId}-${index}`;
        await issueLocalE2EAuthenticationSession(request, subject);

        const joinResponse = await request.post(createJoinUrl(roomId), {
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
          },
        });

        expect(
          joinResponse.status(),
          `${subject} 사용자가 정원 도달 전 방에 참여해야 합니다.`,
        ).toBe(201);
      }
    });

    await authenticateLocalE2EUserAs(
      candidatePage,
      candidateContext,
      `e2e-limit-candidate-${uniqueId}`,
    );
    await candidatePage.goto("/chat");

    const roomCard = await findPublicRoomCard(candidatePage, roomName);
    await roomCard.getByRole("button", { name: `${roomName} 참여하기`, exact: true }).click();
    const roomDetail = candidatePage.getByRole("dialog", { name: roomName, exact: true });
    const joinButton = roomDetail.getByRole("button", { name: "참여하기", exact: true });

    const firstResponse = await test.step("첫 참여 요청은 정원 초과 안내로 종료된다", async () => {
      const response = await clickJoinAndWaitForResponse(candidatePage, roomId, joinButton);
      await expectMemberLimitResponse(response, false);

      await expect(roomDetail.getByRole("alert")).toHaveText(ROOM_MEMBER_LIMIT_MESSAGE);
      await expect(joinButton).toBeEnabled();
      await expect(
        roomDetail.getByRole("button", { name: "같은 요청으로 다시 시도", exact: true }),
      ).toHaveCount(0);

      return response;
    });

    const firstIdempotencyKey = readIdempotencyKey(firstResponse);

    await test.step("동일한 key를 직접 재전송하면 저장된 실패 결과가 replay된다", async () => {
      const replayResponse = await candidateContext.request.post(createJoinUrl(roomId), {
        headers: {
          "Idempotency-Key": firstIdempotencyKey,
        },
      });

      await expectMemberLimitResponse(replayResponse, true);
    });

    await test.step("사용자가 참여 버튼을 다시 누르면 새로운 key로 요청한다", async () => {
      const secondResponse = await clickJoinAndWaitForResponse(candidatePage, roomId, joinButton);
      await expectMemberLimitResponse(secondResponse, false);

      expect(readIdempotencyKey(secondResponse)).not.toBe(firstIdempotencyKey);
      await expect(roomDetail.getByRole("alert")).toHaveText(ROOM_MEMBER_LIMIT_MESSAGE);
      await expect(joinButton).toBeEnabled();
    });
  } finally {
    await Promise.all([ownerContext.close(), candidateContext.close()]);
  }
});

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

async function expectMemberLimitResponse(
  response: APIResponse | Response,
  replayed: boolean,
): Promise<void> {
  expect(response.status()).toBe(409);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({
    status: 409,
    code: "ROOM_MEMBER_LIMIT_EXCEEDED",
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

function createJoinUrl(roomId: string): string {
  return `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms/${roomId}/commands/join`;
}
