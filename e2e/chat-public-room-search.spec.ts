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
      const initialRequest = observerPage.waitForResponse(isPublicRoomListResponse);
      await observerPage.goto("/chat");
      const initialResponse = await initialRequest;
      expect(initialResponse.ok()).toBe(true);
      expectPublicRoomCriteria(initialResponse, { query: null, categoryId: null, cursor: null });
      unfilteredRoomIds = ((await initialResponse.json()) as PublicRoomPage).items
        .map((room) => room.roomId)
        .sort();

      await observerPage
        .getByRole("searchbox", { name: "토론방 이름 검색" })
        .fill(`  ${searchTerm}  `);

      const firstPageResponsePromise = observerPage.waitForResponse((response) => {
        if (!isPublicRoomListResponse(response)) {
          return false;
        }

        const searchParams = new URL(response.url()).searchParams;
        return searchParams.get("query") === searchTerm && !searchParams.has("cursor");
      });

      await observerPage.getByRole("button", { name: "검색", exact: true }).click();

      const firstPageResponse = await firstPageResponsePromise;
      expect(firstPageResponse.ok()).toBe(true);
      expectPublicRoomCriteria(firstPageResponse, {
        query: searchTerm,
        categoryId: null,
        cursor: null,
      });

      const firstPage = (await firstPageResponse.json()) as PublicRoomPage;
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.hasNext).toBe(true);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      const publicRoomItems = observerPage
        .getByRole("list", { name: "공개 토론방" })
        .getByRole("listitem");
      await expect(publicRoomItems).toHaveCount(20);

      const nextPageResponsePromise = observerPage.waitForResponse((response) => {
        if (!isPublicRoomListResponse(response)) {
          return false;
        }

        const searchParams = new URL(response.url()).searchParams;
        return searchParams.get("cursor") === firstPage.nextCursor;
      });

      await observerPage.getByRole("button", { name: "공개 방 더 보기", exact: true }).click();

      const nextPageResponse = await nextPageResponsePromise;
      expect(nextPageResponse.ok()).toBe(true);
      expectPublicRoomCriteria(nextPageResponse, {
        query: searchTerm,
        categoryId: null,
        cursor: firstPage.nextCursor as string,
      });

      const nextPage = (await nextPageResponse.json()) as PublicRoomPage;
      expect(nextPage.items).toHaveLength(1);
      expect(nextPage.hasNext).toBe(false);
      await expect(publicRoomItems).toHaveCount(21);

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
