import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { authenticateDevUserAs } from "./chat-e2e-helpers";

const CHAT_RESOURCE_SERVER_URL =
  process.env.CHAT_E2E_RESOURCE_SERVER_URL ?? "http://localhost:8082";

type RoomCategory = "POLICY" | "ENVIRONMENT" | "LOCAL_ISSUE";

type PublicRoomPage = Readonly<{
  items: readonly Readonly<{ roomId: string }>[];
  nextCursor?: string | null;
  hasNext: boolean;
}>;

test("공개 방 검색과 카테고리 필터가 같은 조건의 cursor pagination을 유지한다", async ({
  browser,
}, testInfo) => {
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
      authenticateDevUserAs(
        observerPage,
        observerContext,
        `e2e-public-search-observer-${uniqueId}`,
      ),
      authenticateDevUserAs(
        primaryOwnerPage,
        primaryOwnerContext,
        `e2e-public-search-owner-a-${uniqueId}`,
      ),
      authenticateDevUserAs(
        secondaryOwnerPage,
        secondaryOwnerContext,
        `e2e-public-search-owner-b-${uniqueId}`,
      ),
    ]);

    const fixtures: { roomId: string }[] = [];

    await test.step("서로 다른 owner로 검색 결과 21개를 준비한다", async () => {
      for (let index = 0; index < 20; index += 1) {
        fixtures.push(
          await createPublicRoom(
            primaryOwnerContext.request,
            `${searchTerm}-room-${index.toString().padStart(2, "0")}`,
            index < 5 ? "ENVIRONMENT" : "POLICY",
          ),
        );
      }

      fixtures.push(
        await createPublicRoom(secondaryOwnerContext.request, `${searchTerm}-room-20`, "POLICY"),
      );
    });

    await test.step("검색 버튼으로 OPEN 첫 페이지 조건을 적용한다", async () => {
      const initialRequest = observerPage.waitForResponse(isPublicRoomListResponse);
      await observerPage.goto("/chat");
      expect((await initialRequest).ok()).toBe(true);

      await observerPage.getByRole("searchbox", { name: "방 제목 검색" }).fill(`  ${searchTerm}  `);

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
        category: null,
        cursor: null,
      });

      const firstPage = (await firstPageResponse.json()) as PublicRoomPage;
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.hasNext).toBe(true);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      const publicRoomItems = observerPage
        .getByRole("list", { name: "공개 채팅방" })
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
        category: null,
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

    await test.step("카테고리 변경은 즉시 첫 페이지부터 다시 조회한다", async () => {
      const filteredResponsePromise = observerPage.waitForResponse((response) => {
        if (!isPublicRoomListResponse(response)) {
          return false;
        }

        const searchParams = new URL(response.url()).searchParams;
        return (
          searchParams.get("query") === searchTerm &&
          searchParams.get("category") === "ENVIRONMENT" &&
          !searchParams.has("cursor")
        );
      });

      await observerPage.getByRole("combobox", { name: "카테고리" }).selectOption("ENVIRONMENT");

      const filteredResponse = await filteredResponsePromise;
      expect(filteredResponse.ok()).toBe(true);
      expectPublicRoomCriteria(filteredResponse, {
        query: searchTerm,
        category: "ENVIRONMENT",
        cursor: null,
      });

      const filteredPage = (await filteredResponse.json()) as PublicRoomPage;
      expect(filteredPage.items).toHaveLength(5);
      expect(filteredPage.hasNext).toBe(false);

      const renderedRoomIds = await readRenderedRoomIds(observerPage);
      const expectedEnvironmentRoomIds = fixtures
        .slice(0, 5)
        .map((room) => room.roomId)
        .sort();
      expect(renderedRoomIds.sort()).toEqual(expectedEnvironmentRoomIds);
    });

    await test.step("공백 검색어는 query를 생략하고 선택 category만 유지한다", async () => {
      await observerPage.getByRole("searchbox", { name: "방 제목 검색" }).fill("   ");

      const responsePromise = observerPage.waitForResponse((response) => {
        if (!isPublicRoomListResponse(response)) {
          return false;
        }

        const searchParams = new URL(response.url()).searchParams;
        return (
          !searchParams.has("query") &&
          searchParams.get("category") === "ENVIRONMENT" &&
          !searchParams.has("cursor")
        );
      });

      await observerPage.getByRole("button", { name: "검색", exact: true }).click();

      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      expectPublicRoomCriteria(response, {
        query: null,
        category: "ENVIRONMENT",
        cursor: null,
      });
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
  category: RoomCategory,
): Promise<{ roomId: string }> {
  const response = await request.post(`${CHAT_RESOURCE_SERVER_URL}/api/v1/rooms`, {
    data: {
      name,
      description: "공개 방 검색·필터 E2E fixture",
      categories: [category],
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
    category: RoomCategory | null;
    cursor: string | null;
  }>,
): void {
  const searchParams = new URL(response.url()).searchParams;

  expect(searchParams.get("joinPolicy")).toBe("OPEN");
  expect(searchParams.get("limit")).toBe("20");
  expect(searchParams.get("query")).toBe(expected.query);
  expect(searchParams.get("category")).toBe(expected.category);
  expect(searchParams.get("cursor")).toBe(expected.cursor);
}

async function readRenderedRoomIds(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "공개 채팅방" })
    .getByRole("article")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const roomId = card.textContent?.match(/방 ID:\s*([A-Za-z0-9_-]+)/)?.[1];

        if (!roomId) {
          throw new Error(`공개 방 card에서 roomId를 찾지 못했습니다: ${card.textContent}`);
        }

        return roomId;
      }),
    );
}
