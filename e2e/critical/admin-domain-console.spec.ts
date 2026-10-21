import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const WEB_BASE_URL = `https://localhost:${process.env.CIVIC_E2E_WEB_PORT ?? "3109"}`;
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = Number(process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791");
const ACCESS_COOKIE = "civic_ai_access_token";
const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const simulationId = "0fa0d1cc-182f-4270-b9aa-66195b3ed8f4";
const scenarioId = "5c2b8a3e-7d41-4f6a-9b0e-3a1f2c4d5e6f";
const policyCategoryId = "00000000-0000-0000-0000-000000000001";
const activeRoomId = "4a52affd-77e8-4bee-86c1-8b74c2ea45ae";

let server: Server;
let chatStatus: "PENDING" | "APPROVED" = "PENDING";
let task = taskFixture("DRAFT");
let createdTaskBody: Record<string, unknown> | null = null;
let approvedCategoryIds: string[] = [];
let roomCategories = categoryFixtures();
let replacedRoomBody: Record<string, unknown> | null = null;
let removeCategoryOnNextPatch = false;
let listedRoomQueries: string[] = [];
let adminRooms = adminRoomFixtures();
let pagedAdminRooms = false;
let adminRoomRequests: URLSearchParams[] = [];
let closeRoomIdempotencyKey: string | null = null;
let closeRoomBody = "";
let createdTaskIdempotencyKey: string | null = null;
let latestSimulationState: "RUNNING" | "COMPLETED" | null = null;
let simulationResultQueries: string[] = [];
let simulationResponseQueries: string[] = [];
let progressSubmissionCount = 3;
let progressRequests = 0;
let preparationStatus: "PROCESSING" | "READY" | "FAILED" | null = null;
let preparationRequests = 0;
let scenarioListEmpty = false;
let scenarioListDelayMs = 0;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${MOCK_API_HOST}:${MOCK_API_PORT}`);
    if (url.pathname === "/api/v1/auth/me") return json(response, currentAdmin());
    if (url.pathname === "/api/v1/admin/user-labels") {
      return json(response, { items: [{ user_id: "requester-1", email: "citizen@example.com" }] });
    }
    if (url.pathname === "/api/v1/admin/room-categories" && request.method === "GET") {
      return json(response, { items: roomCategories });
    }
    if (url.pathname === "/api/v1/admin/room-categories" && request.method === "POST") {
      const body = await readBody(request);
      const created = categoryFixture("category-created", body.name as string, 0);
      roomCategories = [...roomCategories, created];
      return json(response, created, 201, {
        location: `/api/v1/admin/room-categories/${created.categoryId}`,
      });
    }
    if (url.pathname.startsWith("/api/v1/admin/room-categories/") && request.method === "PATCH") {
      const categoryId = url.pathname.split("/").at(-1) ?? "";
      if (removeCategoryOnNextPatch) {
        removeCategoryOnNextPatch = false;
        roomCategories = roomCategories.filter((item) => item.categoryId !== categoryId);
        return json(response, { code: "ROOM_CATEGORY_NOT_FOUND", status: 404 }, 404);
      }
      const body = await readBody(request);
      const current = roomCategories.find((item) => item.categoryId === categoryId);
      if (!current) return json(response, { code: "ROOM_CATEGORY_NOT_FOUND" }, 404);
      const updated = {
        ...current,
        name: body.name as string,
        updatedAt: "2026-08-28T03:00:00Z",
        version: current.version + 1,
      };
      roomCategories = roomCategories.map((item) =>
        item.categoryId === categoryId ? updated : item,
      );
      return json(response, updated);
    }
    if (url.pathname.endsWith("/category-in-use") && request.method === "DELETE") {
      return json(
        response,
        { code: "ROOM_CATEGORY_IN_USE", status: 409, referencedRoomCount: 3 },
        409,
      );
    }
    if (url.pathname.startsWith("/api/v1/admin/room-categories/") && request.method === "DELETE") {
      const categoryId = url.pathname.split("/").at(-1) ?? "";
      roomCategories = roomCategories.filter((item) => item.categoryId !== categoryId);
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/api/v1/admin/room-creation-requests" && request.method === "GET") {
      return json(response, {
        items: url.searchParams.get("status") === chatStatus ? [chatRequest(chatStatus)] : [],
        nextCursor: null,
        hasNext: false,
      });
    }
    if (url.pathname === "/api/v1/admin/room-creation-requests/request-1") {
      return json(response, chatRequest(chatStatus));
    }
    if (url.pathname === "/api/v1/rooms" && request.method === "GET") {
      listedRoomQueries.push(url.searchParams.get("query") ?? "");
      return json(response, {
        items: [
          {
            roomId: "room-1",
            name: "시민 정책 토론방",
            categoryIds: [policyCategoryId],
            activeMemberCount: 4,
            version: 7,
          },
        ],
        nextCursor: null,
        hasNext: false,
      });
    }
    if (url.pathname === "/api/v1/admin/rooms" && request.method === "GET" && pagedAdminRooms) {
      // One room per page: the second page is only reachable through the cursor.
      adminRoomRequests.push(url.searchParams);
      const second = url.searchParams.get("cursor") === "rooms-page-2";
      return json(response, {
        items: [adminRooms[second ? 1 : 0]],
        nextCursor: second ? null : "rooms-page-2",
        hasNext: !second,
      });
    }
    if (url.pathname === "/api/v1/admin/rooms" && request.method === "GET") {
      const query = (url.searchParams.get("query") ?? "").toLocaleLowerCase();
      const status = url.searchParams.get("status");
      return json(response, {
        items: adminRooms.filter(
          (room) =>
            (!query || room.name.toLocaleLowerCase().includes(query)) &&
            (!status || room.status === status),
        ),
        nextCursor: null,
        hasNext: false,
      });
    }
    if (
      url.pathname === `/api/v1/admin/rooms/${activeRoomId}/commands/close` &&
      request.method === "POST"
    ) {
      closeRoomIdempotencyKey = request.headers["idempotency-key"] ?? null;
      closeRoomBody = await readTextBody(request);
      if (!closeRoomIdempotencyKey) {
        return json(response, { code: "INVALID_REQUEST", status: 400 }, 400);
      }
      adminRooms = adminRooms.map((room) =>
        room.roomId === activeRoomId
          ? { ...room, status: "CLOSED" as const, activeMemberCount: 0, version: room.version + 1 }
          : room,
      );
      response.writeHead(204).end();
      return;
    }
    if (
      url.pathname === "/api/v1/admin/room-creation-requests/request-1/approve" &&
      request.method === "POST"
    ) {
      const body = await readBody(request);
      approvedCategoryIds = body.categoryIds as string[];
      chatStatus = "APPROVED";
      return json(response, chatRequest(chatStatus), 201);
    }
    if (url.pathname === "/api/v1/rooms/room-1" && request.method === "GET") {
      return json(response, { roomId: "room-1", categoryIds: [policyCategoryId], version: 7 });
    }
    if (url.pathname === "/api/v1/admin/rooms/room-1/categories" && request.method === "PUT") {
      replacedRoomBody = await readBody(request);
      return json(response, {
        roomId: "room-1",
        categoryIds: replacedRoomBody.categoryIds,
        roomVersion: 8,
        changed: true,
      });
    }
    if (url.pathname === "/api/v1/admin/tasks" && request.method === "GET") {
      return json(response, [taskSummary(task)]);
    }
    if (url.pathname === "/api/v1/admin/simulation-tasks" && request.method === "GET") {
      return json(response, [
        {
          ...taskSummary(task),
          latestSimulation: latestSimulationState ? simulationFixture(latestSimulationState) : null,
        },
      ]);
    }
    if (
      url.pathname === "/api/v1/admin/simulations" &&
      url.searchParams.get("taskId") === taskId &&
      request.method === "GET"
    ) {
      return json(
        response,
        latestSimulationState ? [simulationFixture(latestSimulationState)] : [],
      );
    }
    if (url.pathname === "/api/v1/admin/simulation-scenarios" && request.method === "GET") {
      if (scenarioListDelayMs)
        await new Promise((resolve) => setTimeout(resolve, scenarioListDelayMs));
      return json(response, scenarioListEmpty ? [] : [scenarioFixture()]);
    }
    if (
      url.pathname === `/api/v1/admin/simulations/${simulationId}/results/responses` &&
      request.method === "GET"
    ) {
      simulationResponseQueries.push(url.search);
      return json(response, simulationResponsePageFixture(url.searchParams.get("gender")));
    }
    if (url.pathname === `/api/v1/admin/simulations/${simulationId}` && request.method === "GET") {
      return json(response, simulationFixture(latestSimulationState ?? "RUNNING"));
    }
    if (
      url.pathname === `/api/v1/admin/simulations/${simulationId}/results` &&
      request.method === "GET"
    ) {
      simulationResultQueries.push(url.search);
      return json(
        response,
        simulationResultFixture(url.searchParams.get("gender"), url.searchParams.get("ageGroup")),
      );
    }
    if (
      url.pathname.startsWith(`/api/v1/admin/simulations/${simulationId}/results/`) &&
      request.method === "GET"
    ) {
      const resultSlot = Number(url.pathname.split("/").at(-1));
      return json(response, simulationResultDetailFixture(resultSlot));
    }
    if (url.pathname === "/api/v1/admin/tasks" && request.method === "POST") {
      createdTaskIdempotencyKey = request.headers["idempotency-key"] ?? null;
      if (!createdTaskIdempotencyKey) {
        return json(response, { code: "INVALID_REQUEST", detail: "The request is invalid." }, 400);
      }
      createdTaskBody = await readBody(request);
      task = taskFixture("DRAFT", createdTaskBody.title as string);
      return json(response, task, 201, { location: `/api/v1/admin/tasks/${taskId}` });
    }
    if (url.pathname === `/api/v1/admin/tasks/${taskId}/preparation` && request.method === "POST") {
      preparationRequests += 1;
      preparationStatus = "PROCESSING";
      return json(response, { taskId, preparation: preparationFixture(), replayed: false }, 202);
    }
    if (url.pathname === `/api/v1/admin/tasks/${taskId}` && request.method === "GET") {
      return json(response, {
        task,
        lifecycleHistory: lifecycleHistory(task.status),
        preparation: preparationFixture(),
        capabilities: {
          canEditContent:
            task.status === "DRAFT" && (!preparationStatus || preparationStatus === "FAILED"),
          canStartPreparation:
            task.status === "DRAFT" && (!preparationStatus || preparationStatus === "FAILED"),
          canSchedule: preparationStatus === "READY",
          canOpenNow: preparationStatus === "READY",
        },
      });
    }
    if (
      url.pathname === `/api/v1/admin/tasks/${taskId}/progress-summary` &&
      request.method === "GET"
    ) {
      progressRequests += 1;
      return json(
        response,
        {
          taskId,
          status: "OPEN",
          observedAt: "2026-09-03T01:00:00Z",
          submissionCount: progressSubmissionCount,
          options: task.question.options.map((option, index) => ({
            optionId: option.id,
            content: option.content,
            count: progressSubmissionCount === 0 ? 0 : index === 0 ? 2 : 1,
            rate: progressSubmissionCount === 0 ? 0 : index === 0 ? 2 / 3 : 1 / 3,
          })),
        },
        200,
        { "Cache-Control": "no-store" },
      );
    }
    if (url.pathname === `/api/v1/admin/tasks/${taskId}/open-now` && request.method === "POST") {
      task = {
        ...task,
        status: "OPEN",
        publishedAt: "2026-08-26T03:00:00Z",
        openedAt: "2026-08-26T03:00:00Z",
        schedule: { opensAt: "2026-08-26T03:00:00Z", closesAt: "2026-09-01T00:00:00Z" },
        updatedAt: "2026-08-26T03:00:00Z",
      };
      return json(response, task);
    }
    response.writeHead(404).end();
  });
  await listen(server);
});

test.beforeEach(() => {
  chatStatus = "PENDING";
  task = taskFixture("DRAFT");
  createdTaskBody = null;
  approvedCategoryIds = [];
  roomCategories = categoryFixtures();
  replacedRoomBody = null;
  removeCategoryOnNextPatch = false;
  listedRoomQueries = [];
  adminRooms = adminRoomFixtures();
  closeRoomIdempotencyKey = null;
  closeRoomBody = "";
  createdTaskIdempotencyKey = null;
  latestSimulationState = null;
  simulationResultQueries = [];
  simulationResponseQueries = [];
  progressSubmissionCount = 3;
  progressRequests = 0;
  preparationStatus = null;
  preparationRequests = 0;
});

test.afterAll(async () => close(server));

for (const width of [394, 1440]) {
  test(`관리자 결과 탭에서 진행 중 집계를 조회하고 새로고침한다 (${width}px)`, async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.setViewportSize({ width, height: 900 });
    task = taskFixture("OPEN");
    await page.goto(`/admin/tasks/detail?taskId=${taskId}`);
    await expect(page.getByRole("button", { name: "결과 보기", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "결과", exact: true }).click();
    await expect(page.getByText("진행 중 투표 집계", { exact: true })).toBeVisible();
    await expect(page.getByText("전체 3건", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "A안 득표 비율" })).toHaveAttribute(
      "value",
      /66\.6/,
    );
    await expect(page.getByText("2건 · 66.7%", { exact: true })).toBeVisible();
    await expect(page.getByText(/집계 시각:/)).toBeVisible();
    await expect(page.getByText("결과 다운로드", { exact: true })).toHaveCount(0);
    expect(progressRequests).toBe(1);
    progressSubmissionCount = 0;
    await page.getByRole("button", { name: "현황 새로고침" }).click();
    await expect(page.getByText("전체 0건", { exact: true })).toBeVisible();
    await expect(page.getByText("아직 제출된 응답이 없습니다.")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "A안 득표 비율" })).toHaveAttribute(
      "value",
      "0",
    );
    expect(progressRequests).toBe(2);
    await page.screenshot({
      path: `e2e/.artifacts/wireflow-results/task-progress-${width}.png`,
      fullPage: true,
    });
  });
}

test("채팅 관리자는 신청자 이메일을 확인하고 신청을 승인한다", async ({ context, page }) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat/requests");

  const row = page.getByRole("row", { name: /시민 정책 토론방/ });
  await expect(row).not.toContainText("citizen@example.com");
  await expect(page.getByRole("columnheader", { name: "공개·참여 방식" })).toHaveCount(0);
  await expect(row).not.toContainText("목록 공개");
  await expect(row).not.toContainText("바로 참여");
  await row.click();
  await expect(page).toHaveURL(/\/admin\/chat\/requests\/detail\?requestId=request-1$/u);
  await expect(page.getByText("citizen@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("공개·참여 방식", { exact: true })).toHaveCount(0);
  await expect(page.getByText("목록 공개", { exact: true })).toHaveCount(0);
  await expect(page.getByText("바로 참여", { exact: true })).toHaveCount(0);
  const requestInfo = page.getByRole("region", { name: "신청 정보" });
  const requestDecision = page.getByRole("complementary", { name: "신청 처리" });
  await expect(requestInfo).toBeVisible();
  await expect(requestInfo.getByText("카테고리", { exact: true })).toHaveCount(0);
  await expect(requestDecision).toBeVisible();
  const [requestInfoBox, requestDecisionBox] = await Promise.all([
    requestInfo.boundingBox(),
    requestDecision.boundingBox(),
  ]);
  expect(requestInfoBox).not.toBeNull();
  expect(requestDecisionBox).not.toBeNull();
  expect(requestInfoBox!.y).toBeLessThan(requestDecisionBox!.y);
  expect(
    requestDecisionBox!.y - (requestInfoBox!.y + requestInfoBox!.height),
  ).toBeGreaterThanOrEqual(16);
  const categoryGroup = page.getByRole("group", { name: "승인 카테고리" });
  await categoryGroup.getByLabel("정책").check();
  await categoryGroup.getByLabel("지역 현안").check();
  await requestDecision.getByRole("button", { name: "승인", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("승인했습니다");
  expect(approvedCategoryIds).toEqual([policyCategoryId, "category-local"]);
  await expect(page.getByText("request-1", { exact: true })).toHaveCount(0);
});

test("채팅 관리자는 카테고리를 생성·수정·삭제하고 사용 중 충돌을 확인한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat/categories");

  await expect(page.getByRole("heading", { name: "토론방 운영" })).toBeVisible();
  await expect(page.getByText("ACTIVE · LISTED ROOMS", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "공개 채팅방 표" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "버전" })).toHaveCount(0);
  await page.getByLabel("새 카테고리 이름").fill("복지");
  await page.getByRole("button", { name: "카테고리 추가" }).click();

  const createdRow = page.getByRole("row", { name: /복지/ });
  await expect(createdRow).toBeVisible();
  await createdRow.getByRole("button", { name: "이름 수정" }).click();
  const editDialog = page.getByRole("dialog", { name: "카테고리 이름 편집" });
  await editDialog.getByRole("textbox", { name: "카테고리 이름", exact: true }).fill("생활 복지");
  await editDialog.getByRole("button", { name: "이름 저장" }).click();
  const updatedRow = page.getByRole("row", { name: /생활 복지/ });
  await expect(updatedRow).toBeVisible();
  await updatedRow.getByRole("button", { name: "삭제" }).click();
  const categoryDialog = page.getByRole("alertdialog", { name: "카테고리를 삭제할까요?" });
  await expect(categoryDialog).toContainText("생활 복지");
  await categoryDialog.getByRole("button", { name: "카테고리 삭제" }).click();
  await expect(page.getByRole("row", { name: /생활 복지/ })).toHaveCount(0);

  await page.getByRole("row", { name: /환경/ }).getByRole("button", { name: "삭제" }).click();
  await expect(categoryDialog).toContainText("환경");
  await categoryDialog.getByRole("button", { name: "카테고리 삭제" }).click();
  await expect(page.getByRole("status")).toContainText("3개 토론방에서 사용 중");
});

test("카테고리 목록 요청이 끊겨도 신청 상세와 반려 작업을 유지한다", async ({ context, page }) => {
  await authenticate(context);
  await page.route("**/api/v1/admin/room-categories", (route) => route.abort("failed"));
  await page.goto("/admin/chat/requests/detail?requestId=request-1");

  await expect(page).toHaveURL(/\/admin\/chat\/requests\?requestId=request-1$/u);
  const drawer = page.getByRole("dialog", { name: "시민 정책 토론방" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("citizen@example.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("사유를 입력해 반려")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("카테고리 목록");
});

test("기존 승인·반려 주소는 반려 모드 Drawer로 연결한다", async ({ context, page }) => {
  await authenticate(context);
  await page.goto("/admin/chat/requests/review?requestId=request-1");

  await expect(page).toHaveURL(/\/admin\/chat\/requests\?requestId=request-1&decision=reject$/u);
  const drawer = page.getByRole("dialog", { name: "시민 정책 토론방" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("사유를 입력해 반려")).toBeChecked();
  const rejectionReason = drawer.getByLabel("반려 사유");
  await expect(rejectionReason).toBeVisible();
  await expect(rejectionReason).toHaveCSS("border-top-style", "solid");
  await expect(rejectionReason).toHaveCSS("border-top-width", "1px");
  await expect(drawer.getByText("한 줄 입력")).toHaveCount(0);
});

test("다른 관리자가 삭제한 카테고리의 수정 404에서 최신 목록을 다시 불러온다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.goto("/admin/chat/categories");
  await page.getByLabel("새 카테고리 이름").fill("교통");
  await page.getByRole("button", { name: "카테고리 추가" }).click();

  removeCategoryOnNextPatch = true;
  const row = page.getByRole("row", { name: /교통/ });
  await row.getByRole("button", { name: "이름 수정" }).click();
  const editDialog = page.getByRole("dialog", { name: "카테고리 이름 편집" });
  await editDialog.getByRole("textbox", { name: "카테고리 이름", exact: true }).fill("대중교통");
  await editDialog.getByRole("button", { name: "이름 저장" }).click();

  await expect(page.getByRole("row", { name: /대중교통/ })).toHaveCount(0);
});

test("채팅 관리자는 일반 방 목록의 수정 버튼으로 현재 version의 카테고리를 교체한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat/categories");

  await page.getByLabel("토론방 이름 검색").fill("시민");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect.poll(() => listedRoomQueries).toContain("시민");
  await expect(page.getByText("목록에 없는 방 ID로 찾기", { exact: true })).toHaveCount(0);

  const roomRow = page.getByRole("row", { name: /시민 정책 토론방/ });
  await expect(roomRow).toContainText("정책");
  await roomRow.getByRole("button", { name: "수정" }).click();
  const editor = page.getByRole("dialog", { name: "토론방 카테고리 편집" });
  await expect(editor).toBeVisible();
  const categoryGroup = editor.getByRole("group", { name: "적용할 카테고리" });
  await expect(categoryGroup.getByLabel("정책")).toBeChecked();
  await expect(page.getByText(/현재 버전:/u)).toHaveCount(0);
  await categoryGroup.getByLabel("지역 현안").check();
  await editor.getByRole("button", { name: "변경사항 저장" }).click();

  await expect(page.getByRole("status")).toContainText("카테고리를 교체했습니다");
  expect(replacedRoomBody).toEqual({
    categoryIds: [policyCategoryId, "category-local"],
    expectedVersion: 7,
  });
});

test("토론방 목록은 커서 응답을 이전·다음 페이지로 이동한다", async ({ context, page }) => {
  pagedAdminRooms = true;
  adminRoomRequests = [];
  try {
    await authenticate(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/chat");

    const pager = page.getByRole("group", { name: "토론방 목록 페이지 이동" });
    const first = page.getByRole("row", { name: /시민 정책 토론방/ });
    const second = page.getByRole("row", { name: /지난 정책 기록방/ });
    await expect(first).toBeVisible();
    await expect(second).toHaveCount(0);
    await expect(pager).toContainText("1-1건");
    await expect(pager).toContainText("1페이지");
    await expect(pager.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "더 불러오기" })).toHaveCount(0);

    await pager.getByRole("button", { name: "다음 페이지" }).click();
    await expect(second).toBeVisible();
    await expect(first).toHaveCount(0);
    await expect(pager).toContainText("2페이지");
    await expect(pager.getByRole("button", { name: "다음 페이지" })).toBeDisabled();

    await pager.getByRole("button", { name: "이전 페이지" }).click();
    await expect(first).toBeVisible();
    await expect(second).toHaveCount(0);
    await expect(pager).toContainText("1페이지");

    expect(adminRoomRequests.map((params) => Object.fromEntries(params))).toEqual([
      { limit: "20" },
      { limit: "20", cursor: "rooms-page-2" },
      { limit: "20" },
    ]);
  } finally {
    pagedAdminRooms = false;
  }
});

test("토론방·투표의 목록과 상세 구분선은 같은 높이에서 시작하고 페이지를 늘리지 않는다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat");

  const chatWorkspace = page.locator('[data-wireflow-layout="admin-chat-insights-console"]');
  const chatListHeader = chatWorkspace
    .locator(":scope > .console-pane")
    .first()
    .locator(":scope > .console-pane-header");
  const analysisPanel = chatWorkspace.locator(":scope > .console-pane").nth(1);
  const analysisTabs = analysisPanel.locator(":scope > .console-tabs");
  await expect(chatWorkspace).toBeVisible();
  await expect(analysisPanel).toHaveCSS("border-left-width", "1px");
  await expect(analysisPanel).toHaveCSS("overflow-y", "auto");
  expect(await elementBottomDifference(chatListHeader, analysisTabs)).toBeLessThan(1);
  expect(
    await elementBottomDifference(
      chatWorkspace,
      chatWorkspace.locator(":scope > .console-pane").first(),
    ),
  ).toBeLessThan(1);
  expect(await elementBottomDifference(chatWorkspace, analysisPanel)).toBeLessThan(1);
  expect(await pageHasVerticalOverflow(page)).toBe(false);

  await page.goto(`/admin/tasks?taskId=${taskId}`);
  const taskWorkspace = page.locator('[data-wireflow-layout="admin-task-console"]');
  const taskHeaders = taskWorkspace.locator(":scope > .console-pane > .console-pane-header");
  const taskPanes = taskWorkspace.locator(":scope > .console-pane");
  await expect(taskHeaders).toHaveCount(2);
  expect(await elementBottomDifference(taskHeaders.nth(0), taskHeaders.nth(1))).toBeLessThan(1);
  expect(await elementBottomDifference(taskWorkspace, taskPanes.nth(0))).toBeLessThan(1);
  expect(await elementBottomDifference(taskWorkspace, taskPanes.nth(1))).toBeLessThan(1);
  await expect(page.getByLabel("동작")).toHaveValue("open-now");
  expect(await pageHasVerticalOverflow(page)).toBe(false);
});

test("채팅 관리자는 참여자 수와 관계없이 UUID 멱등성 키로 방을 즉시 종료한다", async ({
  context,
  page,
}) => {
  let releaseExportResponse: (() => void) | null = null;
  await page.route("**/api/v1/admin/rooms/*/conversation-exports", async (route) => {
    await new Promise<void>((resolve) => {
      releaseExportResponse = resolve;
    });
    await route.fulfill({
      body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", status: 503 }),
      contentType: "application/problem+json",
      status: 503,
    });
  });
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat");

  await expect(page.getByRole("heading", { name: "채팅방 관리" })).toBeVisible();
  await expect(page.getByText("운영 상태와 대화 맥락을 함께 확인합니다")).toHaveCount(0);
  const roomWorkbench = page.locator('[data-wireflow-layout="chat-room-admin"]');
  await expect(roomWorkbench).toHaveCSS("padding-left", "32px");
  await expect(roomWorkbench).toHaveCSS("padding-right", "32px");
  await expect(page.getByRole("columnheader", { name: "공개·참여" })).toHaveCount(0);
  const activeRoom = page.getByRole("row", { name: /시민 정책 토론방/u });
  await expect(activeRoom).toContainText("운영 중");
  await expect(activeRoom).not.toContainText("목록 공개");
  await expect(activeRoom).not.toContainText("바로 참여");
  await expect(page.getByRole("row", { name: /지난 정책 기록방/u })).toContainText("종료");
  const detailButton = activeRoom.getByRole("button", { name: "상세 보기" });
  await detailButton.click();
  await expect(page).toHaveURL(new RegExp(`/admin/chat\\?roomId=${activeRoomId}$`, "u"));
  const statisticsDrawer = page.getByRole("dialog", { name: "시민 정책 토론방 통계" });
  await expect(statisticsDrawer).toBeVisible();
  await expect.poll(() => releaseExportResponse !== null).toBe(true);
  const analysisPanel = statisticsDrawer.getByRole("region", { name: "채팅방 통계 상세" });
  await analysisPanel.getByText("채팅방 운영 설정", { exact: true }).click();
  const closeRoomButton = analysisPanel.getByRole("button", { name: "채팅방 종료" });
  try {
    await expect(closeRoomButton).toBeEnabled();
  } finally {
    releaseExportResponse?.();
  }

  await closeRoomButton.click();
  const closeRoomDialog = page.getByRole("alertdialog", {
    name: "채팅방을 즉시 종료할까요?",
  });
  const dialogBox = await closeRoomDialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!dialogBox || !viewport) throw new Error("종료 대화상자 위치를 확인할 수 없습니다.");
  expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await expect(closeRoomDialog).toContainText("모든 사용자");
  await expect(closeRoomDialog).toContainText("접속 중인 연결이 끊깁니다");
  const keepRoomButton = closeRoomDialog.getByRole("button", { name: "운영 유지" });
  const confirmCloseButton = closeRoomDialog.getByRole("button", { name: "채팅방 종료" });
  const confirmationInput = closeRoomDialog.getByLabel("종료 확인 문구");
  await expect(keepRoomButton).toBeEnabled();
  await expect(confirmationInput).toBeFocused();
  await expect(confirmCloseButton).toBeDisabled();
  await confirmationInput.fill("종료합니다");
  await expect(confirmCloseButton).toBeDisabled();
  await confirmationInput.fill("종료합니다.");
  await expect(confirmCloseButton).toBeEnabled();
  expect(
    await closeRoomButton.evaluate((button) => {
      button.focus();
      return document.activeElement === button;
    }),
  ).toBe(false);
  await expect(confirmationInput).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirmCloseButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmationInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(closeRoomDialog).toHaveCount(0);
  await expect(closeRoomButton).toBeFocused();

  await closeRoomButton.click();
  await closeRoomDialog.getByLabel("종료 확인 문구").fill("종료합니다.");
  await closeRoomDialog.getByRole("button", { name: "채팅방 종료" }).click();

  await expect
    .poll(() => closeRoomIdempotencyKey, { timeout: 2_000 })
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(closeRoomBody).toBe("");
  await expect(page.getByRole("status")).toContainText("CLOSED 상태를 확인했습니다");
  await expect(statisticsDrawer.getByRole("button", { name: "채팅방 종료" })).toHaveCount(0);
  expect(adminRooms.find((room) => room.roomId === activeRoomId)).toMatchObject({
    status: "CLOSED",
    activeMemberCount: 0,
  });

  await page.keyboard.press("Escape");
  await expect(statisticsDrawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/chat$/u);
  await expect(detailButton).toBeFocused();
});

test("기존 채팅 통계 주소는 채팅방 관리의 통계 Drawer로 연결한다", async ({ context, page }) => {
  await authenticate(context);
  await page.goto(`/admin/chat/statistics?roomId=${activeRoomId}`);

  await expect(page).toHaveURL(new RegExp(`/admin/chat\\?roomId=${activeRoomId}$`, "u"));
  await expect(page.getByRole("dialog", { name: "시민 정책 토론방 통계" })).toBeVisible();
  await expect(page.getByText("운영 상태와 대화 맥락을 함께 확인합니다")).toHaveCount(0);
});

test("Vote 관리자는 목록의 투표 상세를 우측 Drawer에서 확인한다", async ({ context, page }) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  task = taskFixture("OPEN");
  await page.goto("/admin/tasks");

  const detailButton = page.getByRole("button", { name: "투표 상세" });
  await detailButton.click();

  await expect(page).toHaveURL(`/admin/tasks?taskId=${taskId}`);
  const drawer = page.getByRole("dialog", { name: "투표 상세" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("운영 이력", { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "조기 종료" })).toBeVisible();
  await expect(drawer.getByLabel("동작")).toHaveValue("deadline");
  await expect(drawer.getByRole("option", { name: "즉시 반영" })).toBeAttached();
  await expect(drawer).toHaveCSS("transform", "none");

  const drawerBox = await drawer.boundingBox();
  const viewport = page.viewportSize();
  if (!drawerBox || !viewport) throw new Error("투표 상세 Drawer 위치를 확인할 수 없습니다.");
  expect(Math.abs(drawerBox.x + drawerBox.width - viewport.width)).toBeLessThan(2);
  expect(Math.abs(drawerBox.height - viewport.height)).toBeLessThan(2);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/tasks$/u);
  await expect(detailButton).toBeFocused();
});

test("기존 투표 생성 주소는 목록의 새 투표 Drawer로 연결한다", async ({ context, page }) => {
  await authenticate(context);
  await page.goto("/admin/tasks/create");

  await expect(page).toHaveURL("/admin/tasks?create=1");
  await expect(page.getByRole("dialog", { name: "새 투표 만들기" })).toBeVisible();
});

test("Vote 관리자는 UUID 멱등성 키로 초안을 만들고 Drawer에서 즉시 발행한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1138, height: 768 });
  await page.goto("/admin/tasks");
  await page.getByRole("button", { name: "새 투표 만들기" }).click();

  let createDrawer = page.getByRole("dialog", { name: "새 투표 만들기" });
  await expect(page).toHaveURL("/admin/tasks?create=1");
  await expect(createDrawer.getByRole("navigation", { name: "투표 생성 단계" })).toBeVisible();
  await createDrawer.getByLabel("제목").fill("지역 정책 선호도 조사");
  await createDrawer.getByLabel("상황 또는 사건").fill("운영 확인용 투표");
  await createDrawer.getByRole("button", { name: "다음" }).click();
  await createDrawer.getByLabel("질문", { exact: true }).fill("어떤 안을 선호하시나요?");

  await createDrawer.getByRole("button", { name: "새 투표 만들기 닫기" }).click();
  await expect(createDrawer).toBeHidden();
  await page.getByRole("button", { name: "새 투표 만들기" }).click();
  createDrawer = page.getByRole("dialog", { name: "새 투표 만들기" });
  await expect(createDrawer.getByRole("textbox", { name: "질문", exact: true })).toHaveValue(
    "어떤 안을 선호하시나요?",
  );
  await createDrawer.getByRole("button", { name: /기본 정보/ }).click();
  await expect(createDrawer.getByLabel("제목")).toHaveValue("지역 정책 선호도 조사");
  await expect(createDrawer.getByLabel("상황 또는 사건")).toHaveValue("운영 확인용 투표");
  await createDrawer.getByRole("button", { name: /시민에게 물을 내용/ }).click();
  await createDrawer.getByRole("button", { name: "다음" }).click();
  await expect(createDrawer.getByText("질문 설명", { exact: true })).toHaveCount(0);
  await createDrawer.getByLabel("선택지 1").fill("A안");
  await createDrawer.getByLabel("선택지 2").fill("B안");
  await createDrawer.getByRole("button", { name: "초안 생성" }).click();

  await expect
    .poll(() => createdTaskIdempotencyKey, { timeout: 2_000 })
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  await expect(page).toHaveURL(`/admin/tasks?taskId=${taskId}`);
  const drawer = page.getByRole("dialog", { name: "투표 상세" });
  await expect(drawer).toBeVisible();
  expect(createdTaskBody).toMatchObject({
    title: "지역 정책 선호도 조사",
    description: "운영 확인용 투표",
    question: { description: null },
  });
  await drawer.getByLabel("동작").selectOption("open-now");
  await drawer.getByLabel("마감 시각").fill("2026-09-01T09:00");
  await drawer.getByRole("button", { name: "즉시 발행" }).click();

  await expect(drawer.getByRole("status")).toContainText("최신 상태를 반영했습니다");
  await expect(
    drawer.locator(".civic-user-summary-grid").getByText("진행 중", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByText(taskId, { exact: true })).toHaveCount(0);
  await expect(drawer.getByText("운영 이력", { exact: true })).toHaveCount(0);
});

test("시뮬레이션 탭은 투표 기반 시뮬레이션과 시뮬레이션을 별도 목록으로 보여준다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  task = taskFixture("OPEN", "교통 정책 투표");

  latestSimulationState = null;
  await page.goto("/admin/simulations");
  const voteList = page.getByRole("region", { name: "투표 기반 시뮬레이션 목록" });
  const scenarioList = page.getByRole("region", { name: "시뮬레이션 목록", exact: true });
  await expect(voteList.getByRole("row", { name: /교통 정책 투표/ })).toContainText("미실행");
  const voteBox = await voteList.boundingBox();
  const scenarioBox = await scenarioList.boundingBox();
  expect(voteBox && scenarioBox).toBeTruthy();
  expect(voteBox!.x + voteBox!.width).toBeLessThanOrEqual(scenarioBox!.x);
  expect(Math.abs(voteBox!.y - scenarioBox!.y)).toBeLessThan(2);
  let row = scenarioList.getByRole("row", { name: /교통 정책 시뮬레이션/ });
  const stateBadgeWidths: number[] = [];
  await expect(row).toContainText("미실행");
  stateBadgeWidths.push(
    (await row.locator(".civic-simulation-state-cell").boundingBox())?.width ?? 0,
  );
  await row.click();
  await expect(page).toHaveURL(`/admin/simulations/setup?taskId=${scenarioId}`);

  latestSimulationState = "RUNNING";
  await page.goto("/admin/simulations");
  row = scenarioList.getByRole("row", { name: /교통 정책 시뮬레이션/ });
  await expect(row).toContainText("진행 중");
  stateBadgeWidths.push(
    (await row.locator(".civic-simulation-state-cell").boundingBox())?.width ?? 0,
  );
  await expect(voteList.getByRole("row", { name: /교통 정책 투표/ })).toContainText("진행 중");
  await row.click();
  await expect(page).toHaveURL(`/admin/simulations/status?simulationId=${simulationId}`);

  latestSimulationState = "COMPLETED";
  await page.goto("/admin/simulations");
  row = scenarioList.getByRole("row", { name: /교통 정책 시뮬레이션/ });
  await expect(row).toContainText("완료");
  stateBadgeWidths.push(
    (await row.locator(".civic-simulation-state-cell").boundingBox())?.width ?? 0,
  );
  await row.click();
  await expect(page).toHaveURL(`/admin/simulations/results?simulationId=${simulationId}`);
  expect(stateBadgeWidths).toEqual([76, 76, 76]);

  await page.goto("/admin/simulations");
  await voteList.getByRole("row", { name: /교통 정책 투표/ }).click();
  await expect(page).toHaveURL(`/admin/simulations/vote?taskId=${taskId}`);
  const voteSide = page.getByRole("article", { name: "실제 투표 결과" });
  const simulationSide = page.getByRole("article", { name: "AI 시뮬레이션 결과" });
  await expect(voteSide).toBeVisible();
  await expect(simulationSide).toContainText(/%p/u);
  const voteSideBox = await voteSide.boundingBox();
  const simulationSideBox = await simulationSide.boundingBox();
  expect(voteSideBox!.x + voteSideBox!.width).toBeLessThanOrEqual(simulationSideBox!.x);
  expect(voteSideBox!.y).toBeLessThan(900);
  await expect(page.getByRole("heading", { name: "다시 실행" })).toBeVisible();
});

test("빈 시뮬레이션 목록은 불러오기가 끝나면 로딩 문구 대신 빈 목록 안내를 보여준다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  task = taskFixture("OPEN", "교통 정책 투표");
  scenarioListEmpty = true;
  scenarioListDelayMs = 800;
  try {
    await page.goto("/admin/simulations");
    const section = page.getByRole("region", { name: "시뮬레이션", exact: true });
    const scenarioList = page.getByRole("region", { name: "시뮬레이션 목록", exact: true });
    await expect(scenarioList.getByText("시뮬레이션을 불러오는 중입니다.")).toBeVisible();
    await expect(section.getByText("불러오는 중", { exact: true })).toBeVisible();

    await expect(
      scenarioList.getByText("아직 만든 시뮬레이션이 없습니다. 새 시뮬레이션을 만들어 주세요."),
    ).toBeVisible();
    await expect(scenarioList.getByText("시뮬레이션을 불러오는 중입니다.")).toHaveCount(0);
    await expect(section.getByText("전체 0건", { exact: true })).toBeVisible();
  } finally {
    scenarioListEmpty = false;
    scenarioListDelayMs = 0;
  }
});

test("관리 홈에서 처음 연 시뮬레이션 표는 즉시 스타일이 적용된다", async ({ context, page }) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  task = taskFixture("OPEN", "교통 정책 투표");

  const adminResponse = await page.goto("/admin");
  const contentSecurityPolicy = adminResponse?.headers()["content-security-policy"] ?? "";
  const documentNonce = /style-src[^;]*'nonce-([^']+)'/u.exec(contentSecurityPolicy)?.[1];
  expect(documentNonce).toBeTruthy();

  await page.getByRole("link", { name: "시뮬레이션", exact: true }).click();
  await expect(page).toHaveURL("/admin/simulations");

  const grid = page.getByRole("region", { name: "시뮬레이션 목록", exact: true });
  const rootWrapper = grid.locator(".ag-root-wrapper");
  const headerRow = grid.locator(".ag-header-row");
  await expect(rootWrapper).toBeVisible();
  await expect(headerRow).toBeVisible();
  await expect(grid.getByRole("row", { name: /교통 정책 시뮬레이션/u })).toBeVisible();
  await expect(rootWrapper).toHaveCSS("display", "flex");
  await expect(headerRow).toHaveCSS("display", "flex");

  const injectedGridStyles = page.locator("head style[data-ag-css]");
  await expect(injectedGridStyles.first()).toBeAttached();
  const injectedStyleState = await injectedGridStyles.evaluateAll((styles) =>
    styles.map((style) => ({
      nonce: (style as HTMLStyleElement).nonce,
      ruleCount: (style as HTMLStyleElement).sheet?.cssRules.length ?? 0,
    })),
  );
  expect(injectedStyleState.length).toBeGreaterThan(0);
  expect(injectedStyleState.every(({ nonce }) => nonce === documentNonce)).toBe(true);
  expect(injectedStyleState.some(({ ruleCount }) => ruleCount > 0)).toBe(true);
});

test("시뮬레이션 상태는 자동 종료 기준을 설명하고 서비스 부담을 노출하지 않는다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  latestSimulationState = "COMPLETED";

  await page.goto(`/admin/simulations/status?simulationId=${simulationId}`);

  await expect(page.getByText("자동 종료 기준", { exact: true })).toBeVisible();
  await expect(page.getByText("정산", { exact: true })).toBeVisible();
  await expect(page.getByText("9,200원", { exact: true })).toBeVisible();
  await expect(page.getByText(/서비스 부담/u)).toHaveCount(0);
  await expect(page.getByText("3,855원", { exact: true })).toHaveCount(0);
});

test("시뮬레이션 결과는 모든 성별 집단·도넛 분포·응답 이유를 한 화면에서 비교한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/simulations/results?simulationId=${simulationId}`);

  await expect(page.getByRole("heading", { name: "주민참여예산 우선순위 조사" })).toBeVisible();
  await expect(page.getByRole("img", { name: /생활안전 강화 2명 66.7%/u })).toBeVisible();
  await expect(page.getByText("골목길 안전을 먼저 개선해야 합니다.")).toBeVisible();
  await expect(page.getByText("실행 모델", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/이 결과는 생성형 AI를 사용해 생성한 가상 패널/u)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "상세 화면" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "성별", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(() => simulationResultQueries).toContain("?gender=%EB%82%A8%EC%84%B1");
  await expect.poll(() => simulationResultQueries).toContain("?gender=%EC%97%AC%EC%84%B1");
  const genderComparison = page.getByLabel("성별 기준 집단별 응답 비교");
  await expect(genderComparison.getByRole("heading", { name: "남성" })).toBeVisible();
  await expect(genderComparison.getByRole("heading", { name: "여성" })).toBeVisible();
  await expect(page.getByText("집단 간 가장 큰 차이")).toBeVisible();

  await page.getByRole("button", { name: "연령", exact: true }).click();
  await expect.poll(() => simulationResultQueries).toContain("?ageGroup=30%EB%8C%80");
  await expect.poll(() => simulationResultQueries).toContain("?ageGroup=40%EB%8C%80");
  await expect.poll(() => simulationResultQueries).toContain("?ageGroup=50%EB%8C%80");
  const ageComparison = page.getByLabel("연령 기준 집단별 응답 비교");
  await expect(ageComparison.getByRole("heading", { name: "30대" })).toBeVisible();
  await expect(ageComparison.getByRole("heading", { name: "40대" })).toBeVisible();
  await expect(ageComparison.getByRole("heading", { name: "50대" })).toBeVisible();

  await expect(page.getByText("보행 환경 개선이 모든 주민에게 도움이 됩니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: /다음 결과/u })).toHaveCount(0);
  await page.getByRole("group", { name: "응답 목록 필터" }).getByLabel("성별").selectOption("남성");
  await expect
    .poll(() => simulationResponseQueries)
    .toContain("?offset=0&limit=20&gender=%EB%82%A8%EC%84%B1");
  await expect(page.getByText("골목길 안전을 먼저 개선해야 합니다.")).toHaveCount(0);
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(ageComparison.getByRole("heading", { name: "30대" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("관리자 Chat·Vote 화면은 200% 확대 대응 폭에서도 본문이 잘리지 않는다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 640, height: 900 });

  for (const route of [
    "/admin/chat",
    "/admin/chat/requests",
    "/admin/chat/categories",
    "/admin/tasks?create=1",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${route} must not create page-level horizontal scrolling`,
    ).toBe(true);
  }
});

test("관리자 검색창은 화면별 레이아웃에서도 하나의 문서관리형 컨트롤을 유지한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [route, label] of [
    ["/admin/chat", "토론방 검색"],
    ["/admin/chat/categories", "토론방 이름 검색"],
    ["/admin/tasks", "투표 제목 검색"],
  ] as const) {
    await page.goto(route);
    const input = page.locator(`input.console-search-input[aria-label="${label}"]:not(:disabled)`);
    const control = input.locator("..");
    const button = control.getByRole("button", { name: "검색" });

    await expect(input).toBeVisible();
    await expect(control).toHaveCSS("height", "48px");
    await expect(control).toHaveCSS("max-width", "720px");
    await expect(input).toHaveCSS("border-top-width", "0px");
    await expect(input).toHaveCSS("border-radius", "0px");
    await expect(input).toHaveCSS("box-shadow", "none");
    await expect(button).toHaveCSS("border-radius", "0px");
    await expect(button).toHaveCSS("height", "46px");
    expect((await control.boundingBox())?.width ?? 0).toBeLessThanOrEqual(720);
  }
});

async function authenticate(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: ACCESS_COOKIE,
      value: "admin.payload.signature",
      url: WEB_BASE_URL,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function elementBottomDifference(first: Locator, second: Locator): Promise<number> {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!firstBox || !secondBox) throw new Error("레이아웃 요소의 위치를 확인할 수 없습니다.");
  return Math.abs(firstBox.y + firstBox.height - (secondBox.y + secondBox.height));
}

async function pageHasVerticalOverflow(page: Page): Promise<boolean> {
  // Next dev의 NEXTJS-PORTAL은 html scrollHeight에 46px을 추가한다. 앱 본문 자체의
  // overflow만 검사해야 프로덕션 레이아웃과 같은 조건을 확인할 수 있다.
  return page.evaluate(() => document.body.scrollHeight > document.body.clientHeight + 1);
}

function currentAdmin() {
  return {
    user_id: "00000000-0000-4000-8000-000000000002",
    role: "HIGHEST_ADMIN",
    permissions: ["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"],
    account_state: "ACTIVE",
    must_change_password: false,
  };
}

function chatRequest(status: "PENDING" | "APPROVED") {
  return {
    creationRequestId: "request-1",
    requesterUserId: "requester-1",
    name: "시민 정책 토론방",
    description: "지역 정책을 논의합니다.",
    categoryIds: status === "APPROVED" ? approvedCategoryIds : [],
    visibility: "LISTED",
    joinPolicy: "OPEN",
    status,
    requestedAt: "2026-08-26T03:00:00Z",
    resolvedAt: status === "APPROVED" ? "2026-08-26T03:05:00Z" : null,
    roomId: status === "APPROVED" ? "room-1" : null,
    ownerMembershipId: status === "APPROVED" ? "membership-1" : null,
    roomVersion: status === "APPROVED" ? 0 : null,
    ownerMembershipVersion: status === "APPROVED" ? 0 : null,
    rejectionReason: null,
    replayed: false,
  };
}

function adminRoomFixtures() {
  return [
    adminRoomFixture(activeRoomId, "시민 정책 토론방", "ACTIVE", "LISTED", 4, 7),
    adminRoomFixture(
      "b4ed48e4-a0b7-4338-8740-134749851318",
      "지난 정책 기록방",
      "CLOSED",
      "UNLISTED",
      0,
      3,
    ),
  ];
}

function adminRoomFixture(
  roomId: string,
  name: string,
  status: "ACTIVE" | "CLOSED",
  visibility: "LISTED" | "UNLISTED",
  activeMemberCount: number,
  version: number,
) {
  return {
    roomId,
    name,
    description: `${name} 설명`,
    categoryIds: [policyCategoryId],
    categorySummaries: [{ categoryId: policyCategoryId, name: "정책" }],
    ownerMembershipId: `owner-${roomId}`,
    status,
    visibility,
    joinPolicy: "OPEN" as const,
    activeMemberCount,
    createdAt: "2026-08-28T00:00:00Z",
    version,
  };
}

function categoryFixtures() {
  return [
    categoryFixture(policyCategoryId, "정책", 0),
    categoryFixture("category-local", "지역 현안", 1),
    categoryFixture("category-in-use", "환경", 2),
  ];
}

function categoryFixture(categoryId: string, name: string, version: number) {
  return {
    categoryId,
    name,
    createdAt: "2026-08-28T01:00:00Z",
    updatedAt: "2026-08-28T01:00:00Z",
    version,
  };
}

function taskFixture(status: "DRAFT" | "OPEN", title = "기존 정책 투표") {
  return {
    id: taskId,
    title,
    description: "관리자 설명",
    question: {
      id: "0fb30319-91b2-419a-9bcb-90951bb4f3e9",
      content: "어떤 안을 선호하시나요?",
      description: null,
      options: [
        { id: "4928e1be-b4ef-45c6-bf83-17641cf4183d", displayOrder: 1, content: "A안" },
        { id: "879ba3de-0b84-412b-b51f-e879e9d8f6e2", displayOrder: 2, content: "B안" },
      ],
    },
    status,
    schedule: null,
    publishedAt: null,
    openedAt: null,
    closedAt: null,
    closureType: null,
    createdAt: "2026-08-26T02:00:00Z",
    updatedAt: "2026-08-26T02:00:00Z",
  };
}

function taskSummary(current: ReturnType<typeof taskFixture>) {
  return {
    taskId: current.id,
    title: current.title,
    status: current.status,
    schedule: current.schedule,
    publishedAt: current.publishedAt,
    openedAt: current.openedAt,
    closedAt: current.closedAt,
    closureType: current.closureType,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  };
}

function simulationFixture(state: "RUNNING" | "COMPLETED") {
  return {
    simulationId,
    taskId,
    state,
    personaCount: 77,
    progressPercent: state === "COMPLETED" ? 100 : 26,
    cancelRequested: false,
    errorCode: null,
    resumeAt: null,
    retryAvailableAt: null,
    waitReason: null,
    createdAt: "2026-08-29T02:23:06Z",
    startedAt: "2026-08-29T02:23:07Z",
    completedAt: state === "COMPLETED" ? "2026-08-29T02:28:00Z" : null,
    deadlineAt: "2026-08-29T02:53:06Z",
    estimatedCompletionAt: state === "COMPLETED" ? null : "2026-08-29T02:29:00Z",
    canCancel: state === "RUNNING",
    estimatedKrw: 9500,
    holdKrw: 11400,
    settledKrw: state === "COMPLETED" ? 9200 : null,
    absorbedKrw: state === "COMPLETED" ? 3855 : 0,
    billingState: state === "COMPLETED" ? "SETTLED" : "HELD",
  };
}

function simulationResultFixture(gender: string | null, ageGroup: string | null) {
  const isMen = gender === "남성";
  const isWomen = gender === "여성";
  const isAgeGroup = ageGroup !== null;
  const filteredCount = isMen ? 1 : isWomen ? 2 : isAgeGroup ? 1 : 3;
  const firstCount =
    isMen || ageGroup === "30대" || ageGroup === "40대"
      ? 1
      : isWomen
        ? 1
        : ageGroup === "50대"
          ? 0
          : 2;
  const secondCount = isMen || ageGroup === "30대" || ageGroup === "40대" ? 0 : 1;
  const optionResults = [
    {
      optionId: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
      displayOrder: 1,
      content: "생활안전 강화",
      count: firstCount,
      percentage: (firstCount / filteredCount) * 100,
    },
    {
      optionId: "879ba3de-0b84-412b-b51f-e879e9d8f6e2",
      displayOrder: 2,
      content: "돌봄·복지 확대",
      count: secondCount,
      percentage: (secondCount / filteredCount) * 100,
    },
  ];
  return {
    schemaVersion: "CIVIC_TASK_SIMULATION_RESULT_VIEW_V2",
    notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
    task: {
      id: taskId,
      title: "주민참여예산 우선순위 조사",
      question: {
        id: "0fb30319-91b2-419a-9bcb-90951bb4f3e9",
        content: "주민참여예산을 한 분야에 우선 배정한다면 어디에 투자해야 합니까?",
        options: [
          {
            id: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
            displayOrder: 1,
            content: "생활안전 강화",
          },
          {
            id: "879ba3de-0b84-412b-b51f-e879e9d8f6e2",
            displayOrder: 2,
            content: "돌봄·복지 확대",
          },
        ],
      },
    },
    run: {
      personaCount: 3,
      modelType: "claude-sonnet-4-6",
      filters: {},
    },
    denominators: { total: 3, filtered: filteredCount },
    optionResults,
    unansweredCount: 0,
    summary: {
      totalRespondentCount: 3,
      filteredRespondentCount: filteredCount,
      answeredPersonaCount: filteredCount,
      unansweredPersonaCount: 0,
      optionResults,
    },
    availableFilters: {
      genders: ["남성", "여성"],
      ageGroups: ["30대", "40대", "50대"],
    },
    resultSlots: isMen
      ? [2]
      : isWomen
        ? [1, 3]
        : ageGroup === "30대"
          ? [1]
          : ageGroup === "40대"
            ? [2]
            : ageGroup === "50대"
              ? [3]
              : [1, 2, 3],
  };
}

function simulationResultDetailFixture(resultSlot: number) {
  const details = {
    1: {
      selectedOptionId: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
      reason: "골목길 안전을 먼저 개선해야 합니다.",
      demographics: { gender: "여성", ageGroup: "30대" },
    },
    2: {
      selectedOptionId: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
      reason: "보행 환경 개선이 모든 주민에게 도움이 됩니다.",
      demographics: { gender: "남성", ageGroup: "40대" },
    },
    3: {
      selectedOptionId: "879ba3de-0b84-412b-b51f-e879e9d8f6e2",
      reason: "돌봄 공백을 줄이는 정책이 더 시급합니다.",
      demographics: { gender: "여성", ageGroup: "50대" },
    },
  } as const;
  const detail = details[resultSlot as keyof typeof details] ?? details[1];
  return {
    schemaVersion: "CIVIC_TASK_SIMULATION_SLOT_DETAIL_V1",
    notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
    resultSlot,
    ...detail,
  };
}

function scenarioFixture() {
  return {
    scenarioId,
    title: "교통 정책 시뮬레이션",
    description: null,
    question: {
      id: "2d6f1b9a-3c4e-4a5b-8c7d-9e0f1a2b3c4d",
      content: "가장 먼저 개선할 교통 정책은 무엇인가요?",
      description: null,
      options: [
        { id: "4928e1be-b4ef-45c6-bf83-17641cf4183d", displayOrder: 1, content: "생활안전 강화" },
        { id: "879ba3de-0b84-412b-b51f-e879e9d8f6e2", displayOrder: 2, content: "돌봄·복지 확대" },
      ],
    },
    sourceTaskId: null,
    createdAt: "2026-08-29T02:00:00Z",
    updatedAt: "2026-08-29T02:00:00Z",
    latestSimulation: latestSimulationState ? simulationFixture(latestSimulationState) : null,
  };
}

function simulationResponsePageFixture(gender: string | null) {
  const items = [1, 2, 3]
    .map((resultSlot) => {
      const {
        schemaVersion: _schemaVersion,
        notice: _notice,
        ...item
      } = simulationResultDetailFixture(resultSlot);
      return item;
    })
    .filter((item) => !gender || item.demographics.gender === gender);
  return {
    schemaVersion: "CIVIC_TASK_SIMULATION_RESPONSE_PAGE_V1",
    notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
    total: items.length,
    offset: 0,
    limit: 20,
    items,
  };
}

function lifecycleHistory(status: "DRAFT" | "OPEN") {
  if (status === "DRAFT") return [];
  return [
    {
      id: "event-0",
      eventType: "CREATED",
      previousStatus: "DRAFT",
      newStatus: "DRAFT",
      previousSchedule: null,
      newSchedule: null,
      trigger: "ADMIN",
      actorId: "00000000-0000-4000-8000-000000000002",
      reason: null,
      closureType: null,
      occurredAt: "2026-08-26T01:50:00Z",
    },
    {
      id: "event-1",
      eventType: "OPENED",
      previousStatus: null,
      newStatus: status,
      previousSchedule: null,
      newSchedule: null,
      trigger: "ADMIN",
      actorId: "00000000-0000-4000-8000-000000000002",
      reason: null,
      closureType: null,
      occurredAt: "2026-08-26T02:00:00Z",
    },
  ];
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function readTextBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function json(
  response: ServerResponse,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function listen(value: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    value.once("error", reject);
    value.listen(MOCK_API_PORT, MOCK_API_HOST, resolve);
  });
}

function close(value: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    value.close((error) => (error ? reject(error) : resolve()));
  });
}

function preparationFixture() {
  if (!preparationStatus) return null;
  return {
    requestId: "preparation-1",
    status: preparationStatus,
    contentFingerprint: `sha256:${"a".repeat(64)}`,
    attemptCount: Math.max(1, preparationRequests),
    // 생성 지연(30분) 기준에 걸리지 않도록 현재 시각 기준으로 만든다.
    processingStartedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    preparedAt: preparationStatus === "READY" ? new Date(Date.now() - 60_000).toISOString() : null,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    lastError:
      preparationStatus === "FAILED"
        ? {
            code: "MODEL_UNAVAILABLE",
            detail: "AI 모델을 일시적으로 사용할 수 없습니다.",
            retryable: true,
          }
        : null,
  };
}

for (const width of [394, 1440]) {
  test(`AI 예상 답변 생성·재시도·완료를 관리자 메인과 상세에서 확인한다 (${width}px)`, async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/admin/tasks/detail?taskId=${taskId}`);
    const panel = page.getByRole("region", { name: "AI 예상 답변 생성", exact: true });
    await panel.getByRole("button", { name: "답변 생성 시작", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("생성 중");
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(preparationRequests).toBe(1);
    await page.goto("/admin");
    const operations = page.getByRole("region", { name: "현재 처리 중" });
    const vote = operations.getByRole("listitem").filter({ hasText: "투표 AI" });
    await expect(vote).not.toContainText("작업중");
    await expect(vote).toContainText("생성 중");
    await expect(vote).toContainText(/\d+분 경과/u);
    const operationBounds = await operations.boundingBox();
    const actionBounds = await vote.getByRole("link", { name: /처리 상세보기/ }).boundingBox();
    expect(operationBounds).not.toBeNull();
    expect(actionBounds).not.toBeNull();
    expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
      operationBounds!.x + operationBounds!.width,
    );
    await page.screenshot({
      path: `e2e/.artifacts/wireflow-results/ai-preparation-home-${width}.png`,
      fullPage: true,
    });
    preparationStatus = "FAILED";
    await expect(vote).toContainText("재시도 필요");
    const alert = page.getByRole("alert").filter({ hasText: "AI 예상 답변 생성에 실패한 투표" });
    await expect(alert).toContainText("1건");
    await vote.getByRole("link", { name: /처리 상세보기/ }).click();
    await expect(panel.getByRole("status")).toHaveText("재시도 필요");
    await panel.getByText("오류 상세 보기", { exact: true }).click();
    await expect(
      panel.getByText("AI 모델을 일시적으로 사용할 수 없습니다.", { exact: true }),
    ).toBeVisible();
    await panel.screenshot({
      path: `e2e/.artifacts/wireflow-results/ai-preparation-retry-${width}.png`,
    });
    await panel.getByRole("button", { name: "답변 생성 다시 시도", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("생성 중");
    expect(preparationRequests).toBe(2);
    preparationStatus = "READY";
    await expect(panel.getByRole("status")).toHaveText("생성 완료");
    await expect(panel).toContainText("바로 시작하거나 예약");
    await page.goto("/admin");
    await expect(operations).toContainText("현재 확인된 진행 작업은 없습니다.");
    await expect(vote).toHaveCount(0);
  });
}
