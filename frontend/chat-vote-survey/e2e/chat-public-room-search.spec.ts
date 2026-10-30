import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { authenticateLocalE2EUserAs } from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";

type PublicRoomPage = Readonly<{
  items: readonly Readonly<{ roomId: string }>[];
  nextCursor?: string | null;
  hasNext: boolean;
}>;

test("공개 방 검색이 같은 조건의 cursor pagination을 유지한다", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const searchTerm = `e2e-search-${uniqueId}`;
  const observerContext = await browser.newContext({ baseURL });
  const primaryOwnerContext = await browser.newContext({ baseURL });
  const secondaryOwnerContext = await browser.newContext({ baseURL });
  const observerPage = await observerContext.newPage();
  const primaryOwnerPage = await primaryOwnerContext.newPage();
  const secondaryOwnerPage = await secondaryOwnerContext.newPage();

  try {
    await Promise.all([
      authenticateLocalE2EUserAs(
        observerPage,
        observerContext,
        `e2e-public-search-observer-${uniqueId}`,
      ),
      authenticateLocalE2EUserAs(
        primaryOwnerPage,
        primaryOwnerContext,
        `e2e-public-search-owner-a-${uniqueId}`,
      ),
      authenticateLocalE2EUserAs(
        secondaryOwnerPage,
        secondaryOwnerContext,
        `e2e-public-search-owner-b-${uniqueId}`,
      ),
    ]);

    const fixtures: { roomId: string }[] = [];
    let unfilteredRoomIds: string[] = [];

    await test.step("서로 다른 owner로 검색 결과 21개를 준비한다", async () => {
      for (let index = 0; index < 20; index += 1) {
        fixtures.push(
          await createPublicRoom(
            primaryOwnerContext.request,
            `${searchTerm}-room-${index.toString().padStart(2, "0")}`,
          ),
        );
      }

      fixtures.push(await createPublicRoom(secondaryOwnerContext.request, `${searchTerm}-room-20`));
    });

    await test.step("검색 버튼으로 OPEN 첫 페이지 조건을 적용한다", async () => {
      const initialRequest = waitForPublicRoomPage(observerPage, () => true);
      await observerPage.goto("/chat");
      const { page: initialPage, response: initialResponse } = await initialRequest;
      expectPublicRoomCriteria(initialResponse, { query: null, categoryId: null, cursor: null });
      unfilteredRoomIds = initialPage.items.map((room) => room.roomId).sort();

      await observerPage
        .getByRole("searchbox", { name: "토론방 이름 검색" })
        .fill(`  ${searchTerm}  `);

      const firstPageResponsePromise = waitForPublicRoomPage(observerPage, (response) => {
        const searchParams = new URL(response.url()).searchParams;
        return searchParams.get("query") === searchTerm && !searchParams.has("cursor");
      });

      await observerPage.getByRole("button", { name: "검색", exact: true }).click();

      const { page: firstPage, response: firstPageResponse } = await firstPageResponsePromise;
      expectPublicRoomCriteria(firstPageResponse, {
        query: searchTerm,
        categoryId: null,
        cursor: null,
      });

      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.hasNext).toBe(true);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      const publicRoomItems = observerPage
        .getByRole("list", { name: "공개 토론방" })
        .getByRole("listitem");
      await expect(publicRoomItems).toHaveCount(20);

      const nextPageResponsePromise = waitForPublicRoomPage(observerPage, (response) => {
        const searchParams = new URL(response.url()).searchParams;
        return searchParams.get("cursor") === firstPage.nextCursor;
      });

      // 공개 방 목록은 상자 끝에 가까워지면 다음 페이지를 자동으로 받으므로, 더 보기 버튼 대신 목록 상자를 끝까지 내림
      await expect(
        observerPage.getByRole("button", { name: "공개 방 더 보기", exact: true }),
      ).toHaveCount(0);
      await observerPage.getByRole("list", { name: "공개 토론방" }).evaluate((list) => {
        list.scrollTop = list.scrollHeight;
      });

      const { page: nextPage, response: nextPageResponse } = await nextPageResponsePromise;
      expectPublicRoomCriteria(nextPageResponse, {
        query: searchTerm,
        categoryId: null,
        cursor: firstPage.nextCursor as string,
      });

      expect(nextPage.items).toHaveLength(1);
      expect(nextPage.hasNext).toBe(false);
      await expect(publicRoomItems).toHaveCount(21);
      await expect(observerPage.getByText("모든 토론방을 확인했어요.")).toBeVisible();

      const expectedRoomIds = fixtures.map((room) => room.roomId).sort();
      const responseRoomIds = [...firstPage.items, ...nextPage.items]
        .map((room) => room.roomId)
        .sort();
      const renderedRoomIds = (await readRenderedRoomIds(observerPage)).sort();

      expect(responseRoomIds).toEqual(expectedRoomIds);
      expect(renderedRoomIds).toEqual(expectedRoomIds);
      expect(new Set(renderedRoomIds).size).toBe(21);
    });

    await test.step("검색어를 공백으로 비우면 즉시 검색 조건 없는 목록으로 돌아간다", async () => {
      const searchRequestUrls: URL[] = [];
      observerPage.on("request", (request) => {
        const url = new URL(request.url());
        if (request.method() === "GET" && url.pathname === "/api/v1/rooms") {
          searchRequestUrls.push(url);
        }
      });

      // 검색어를 비우면 검색 버튼 없이 바로 해제되고 같은 조건의 목록은 Query cache를 쓸 수 있음
      await observerPage.getByRole("searchbox", { name: "토론방 이름 검색" }).fill("   ");
      await expect
        .poll(async () => (await readRenderedRoomIds(observerPage)).sort())
        .toEqual(unfilteredRoomIds);

      await observerPage.getByRole("button", { name: "검색", exact: true }).click();
      await expect
        .poll(async () => (await readRenderedRoomIds(observerPage)).sort())
        .toEqual(unfilteredRoomIds);

      for (const url of searchRequestUrls) {
        expect(url.searchParams.has("query")).toBe(false);
        expect(url.searchParams.has("categoryId")).toBe(false);
      }
    });
  } finally {
    await Promise.all([
      observerContext.close(),
      primaryOwnerContext.close(),
      secondaryOwnerContext.close(),
    ]);
  }
});

test("목록을 켜 둔 채 다른 사용자가 공개 방을 만들거나 종료하면 새로고침 없이 반영한다", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);

  const baseURL = String(testInfo.project.use.baseURL);
  const uniqueId = crypto.randomUUID();
  const searchTerm = `e2e-public-live-${uniqueId}`;
  const roomName = `${searchTerm}-room`;
  const observerContext = await browser.newContext({ baseURL });
  const ownerContext = await browser.newContext({ baseURL });
  const observerPage = await observerContext.newPage();
  const ownerPage = await ownerContext.newPage();

  try {
    await Promise.all([
      authenticateLocalE2EUserAs(
        observerPage,
        observerContext,
        `e2e-public-live-observer-${uniqueId}`,
      ),
      authenticateLocalE2EUserAs(ownerPage, ownerContext, `e2e-public-live-owner-${uniqueId}`),
    ]);

    await observerPage.goto("/chat");
    await expect(observerPage.locator('[data-chat-connection-status="connected"]')).toHaveCount(1);

    const searchForm = observerPage.getByRole("search", { name: "공개 토론방 검색" });
    await searchForm.getByRole("searchbox", { name: "토론방 이름 검색" }).fill(searchTerm);
    const searchResponse = waitForPublicRoomPage(
      observerPage,
      (response) => new URL(response.url()).searchParams.get("query") === searchTerm,
    );
    await searchForm.getByRole("button", { name: "검색", exact: true }).click();
    expect((await searchResponse).page.items).toHaveLength(0);
    const roomCard = observerPage.getByRole("article").filter({ hasText: roomName });

    const roomId =
      await test.step("공개 방 생성 신호로 검색 조건을 유지한 채 첫 페이지부터 다시 조회한다", async () => {
        const refreshResponse = waitForPublicRoomPage(
          observerPage,
          (response) => new URL(response.url()).searchParams.get("query") === searchTerm,
        );
        const room = await createPublicRoom(ownerContext.request, roomName);

        const { page, response } = await refreshResponse;
        expectPublicRoomCriteria(response, { query: searchTerm, categoryId: null, cursor: null });
        expect(page.items.map((item) => item.roomId)).toEqual([room.roomId]);
        await expect(roomCard).toBeVisible();

        return room.roomId;
      });

    await test.step("공개 방 종료 신호로 목록에서 뺀다", async () => {
      const response = await ownerContext.request.post(
        `${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms/${roomId}/commands/close`,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      expect(response.status(), "공개 방 종료가 성공해야 합니다.").toBe(200);

      await expect(roomCard).toHaveCount(0);
    });
  } finally {
    await Promise.all([observerContext.close(), ownerContext.close()]);
  }
});

async function createPublicRoom(
  request: APIRequestContext,
  name: string,
): Promise<{ roomId: string }> {
  const response = await request.post(`${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms`, {
    data: {
      name,
      description: "공개 방 검색·필터 E2E fixture",
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

  return { roomId: body.roomId as string };
}

// 화면이 목록을 불러오는 도중 같은 목록을 다시 요청하면 앞의 요청은 중간에 끊김
// 끊긴 요청도 응답으로 잡히지만 내용이 없어 읽으면 오류가 나므로 내용을 읽지 못한 응답은 건너뛰고 다음 응답을 기다림
async function waitForPublicRoomPage(
  browserPage: Page,
  matches: (response: Response) => boolean,
): Promise<Readonly<{ page: PublicRoomPage; response: Response }>> {
  const captured: { page: PublicRoomPage | null } = { page: null };
  const response = await browserPage.waitForResponse(async (candidate) => {
    if (!isPublicRoomListResponse(candidate) || !matches(candidate)) {
      return false;
    }

    if (!candidate.ok()) {
      return true;
    }

    try {
      captured.page = (await candidate.json()) as PublicRoomPage;
      return true;
    } catch {
      return false;
    }
  });

  expect(response.ok(), `공개 방 목록 조회가 성공해야 합니다: ${response.status()}`).toBe(true);
  return { page: captured.page!, response };
}

function isPublicRoomListResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" && new URL(response.url()).pathname === "/api/v1/rooms"
  );
}

function expectPublicRoomCriteria(
  response: Response,
  expected: Readonly<{
    query: string | null;
    categoryId: string | null;
    cursor: string | null;
  }>,
): void {
  const searchParams = new URL(response.url()).searchParams;

  expect(searchParams.get("joinPolicy")).toBe("OPEN");
  expect(searchParams.get("limit")).toBe("20");
  expect(searchParams.get("query")).toBe(expected.query);
  expect(searchParams.get("categoryId")).toBe(expected.categoryId);
  expect(searchParams.get("cursor")).toBe(expected.cursor);
}

async function readRenderedRoomIds(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "공개 토론방" })
    .getByRole("article")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const roomId = card.dataset.roomId;

        if (!roomId) {
          throw new Error(`공개 방 card에 data-room-id가 없습니다: ${card.textContent}`);
        }

        return roomId;
      }),
    );
}
