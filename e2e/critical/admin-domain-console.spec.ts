import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { expect, test, type BrowserContext } from "@playwright/test";

const WEB_BASE_URL = "https://localhost:3109";
const MOCK_API_HOST = "127.0.0.1";
const MOCK_API_PORT = Number(process.env.CIVIC_E2E_ADMIN_MOCK_PORT ?? "4791");
const ACCESS_COOKIE = "civic_ai_access_token";
const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const simulationId = "0fa0d1cc-182f-4270-b9aa-66195b3ed8f4";
const policyCategoryId = "00000000-0000-0000-0000-000000000001";

let server: Server;
let chatStatus: "PENDING" | "APPROVED" = "PENDING";
let task = taskFixture("DRAFT");
let createdTaskBody: Record<string, unknown> | null = null;
let approvedCategoryIds: string[] = [];
let roomCategories = categoryFixtures();
let replacedRoomBody: Record<string, unknown> | null = null;
let removeCategoryOnNextPatch = false;
let listedRoomQueries: string[] = [];
let createdTaskIdempotencyKey: string | null = null;
let latestSimulationState: "RUNNING" | "COMPLETED" | null = null;
let simulationResultQueries: string[] = [];

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
      url.pathname === `/api/v1/admin/simulations/${simulationId}/results` &&
      request.method === "GET"
    ) {
      simulationResultQueries.push(url.search);
      return json(response, simulationResultFixture(url.searchParams.get("gender")));
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
    if (url.pathname === `/api/v1/admin/tasks/${taskId}` && request.method === "GET") {
      return json(response, { task, lifecycleHistory: lifecycleHistory(task.status) });
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
  createdTaskIdempotencyKey = null;
  latestSimulationState = null;
  simulationResultQueries = [];
});

test.afterAll(async () => close(server));

test("채팅 관리자는 신청자 이메일을 확인하고 신청을 승인한다", async ({ context, page }) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat/requests");

  const row = page.getByRole("row", { name: /시민 정책 토론방/ });
  await expect(row).toContainText("citizen@example.com");
  await row.getByRole("link", { name: "상세 검토" }).click();
  await expect(page).toHaveURL(/\/admin\/chat\/requests\/detail\?requestId=request-1$/u);
  await expect(page.getByRole("heading", { name: "채팅방 생성 요청 검토" })).toBeVisible();
  await expect(page.getByText("citizen@example.com", { exact: true })).toBeVisible();
  const categoryGroup = page.getByRole("group", { name: "승인 카테고리" });
  await categoryGroup.getByLabel("정책").check();
  await categoryGroup.getByLabel("지역 현안").check();
  await page.getByRole("button", { name: "승인", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("승인했습니다");
  await expect(page.getByText("승인", { exact: true })).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "채팅방 카테고리 관리" })).toBeVisible();
  await page.getByLabel("새 카테고리 이름").fill("복지");
  await page.getByRole("button", { name: "카테고리 추가" }).click();

  const createdRow = page.getByRole("row", { name: /복지/ });
  await expect(createdRow).toBeVisible();
  await createdRow.getByLabel("카테고리 이름").fill("생활 복지");
  await createdRow.getByRole("button", { name: "이름 저장" }).click();
  const updatedRow = page.getByRole("row", { name: /생활 복지/ });
  await expect(updatedRow).toBeVisible();
  const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toContain("생활 복지");
    await dialog.accept();
  });
  await updatedRow.getByRole("button", { name: "삭제" }).click();
  await confirmation;
  await expect(page.getByRole("row", { name: /생활 복지/ })).toHaveCount(0);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("row", { name: /환경/ }).getByRole("button", { name: "삭제" }).click();
  await expect(page.getByRole("status")).toContainText("3개 채팅방에서 사용 중");
});

test("카테고리 목록 요청이 끊겨도 신청 상세와 반려 작업을 유지한다", async ({ context, page }) => {
  await authenticate(context);
  await page.route("**/api/v1/admin/room-categories", (route) => route.abort("failed"));
  await page.goto("/admin/chat/requests/detail?requestId=request-1");

  await expect(page.getByText("citizen@example.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("사유를 입력해 반려")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("카테고리 목록");
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
  await row.getByLabel("카테고리 이름").fill("대중교통");
  await row.getByRole("button", { name: "이름 저장" }).click();

  await expect(page.getByRole("row", { name: /대중교통/ })).toHaveCount(0);
});

test("채팅 관리자는 일반 방 목록에서 선택해 현재 version으로 카테고리를 교체한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/chat/categories");

  await page.getByLabel("채팅방 이름 검색").fill("시민");
  await page.getByRole("button", { name: "검색" }).click();
  await expect.poll(() => listedRoomQueries).toContain("시민");
  await expect(page.getByText("목록에 없는 방 ID로 찾기", { exact: true })).toHaveCount(0);

  const roomRow = page.getByRole("row", { name: /시민 정책 토론방/ });
  await expect(roomRow).toContainText("정책");
  await roomRow.getByRole("button", { name: "선택" }).click();
  const categoryGroup = page.getByRole("group", { name: "교체할 카테고리" });
  await expect(categoryGroup.getByLabel("정책")).toBeChecked();
  await expect(page.getByText(/현재 버전:/u)).toHaveCount(0);
  await categoryGroup.getByLabel("지역 현안").check();
  await page.getByRole("button", { name: "카테고리 교체" }).click();

  await expect(page.getByRole("status")).toContainText("카테고리를 교체했습니다");
  expect(replacedRoomBody).toEqual({
    categoryIds: [policyCategoryId, "category-local"],
    expectedVersion: 7,
  });
});

test("Vote 관리자는 UUID 멱등성 키로 초안을 만들고 즉시 발행한다", async ({ context, page }) => {
  await authenticate(context);
  await page.setViewportSize({ width: 1138, height: 768 });
  await page.goto("/admin/tasks/create");

  await page.getByLabel("제목").fill("지역 정책 선호도 조사");
  await page.getByLabel("관리자 설명").fill("운영 확인용 과업");
  await page.getByLabel("질문", { exact: true }).fill("어떤 안을 선호하시나요?");
  await page.getByLabel("선택지 1").fill("A안");
  await page.getByLabel("선택지 2").fill("B안");
  await page.getByRole("button", { name: "초안 생성" }).click();

  await expect
    .poll(() => createdTaskIdempotencyKey, { timeout: 2_000 })
    .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  await expect(page.getByRole("heading", { name: "과업 상세" })).toBeVisible();
  expect(createdTaskBody).toMatchObject({ title: "지역 정책 선호도 조사" });
  await page.getByLabel("동작").selectOption("open-now");
  await page.getByLabel("마감 시각").fill("2026-09-01T09:00");
  await page.getByRole("button", { name: "즉시 발행" }).click();

  await expect(page.getByRole("status")).toContainText("최신 상태를 반영했습니다");
  await expect(
    page.locator(".civic-user-summary-grid").getByText("진행 중", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(taskId, { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  const [summaryBox, questionBox, operationsBox] = await Promise.all([
    page.getByRole("group", { name: "과업 요약" }).boundingBox(),
    page.locator(".civic-task-detail-content").boundingBox(),
    page.getByRole("complementary", { name: "과업 운영" }).boundingBox(),
  ]);
  if (!summaryBox || !questionBox || !operationsBox) {
    throw new Error("과업 상세의 고밀도 레이아웃 영역을 측정하지 못했습니다.");
  }
  expect(summaryBox.height).toBeLessThan(125);
  expect(Math.abs(questionBox.y - operationsBox.y)).toBeLessThan(2);
  expect(operationsBox.x).toBeGreaterThan(questionBox.x + questionBox.width);
  expect(operationsBox.y + operationsBox.height).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 768,
  );
});

test("시뮬레이션 목록은 최신 실행 상태에 맞는 진행·결과 화면으로 연결한다", async ({
  context,
  page,
}) => {
  await authenticate(context);
  task = taskFixture("OPEN", "교통 정책 과업");

  latestSimulationState = null;
  await page.goto("/admin/simulations");
  let row = page.getByRole("row", { name: /교통 정책 과업/ });
  await expect(row).toContainText("준비됨");
  await expect(row.getByRole("link", { name: "설정하기" })).toHaveAttribute(
    "href",
    `/admin/simulations/setup?taskId=${taskId}`,
  );

  latestSimulationState = "RUNNING";
  await page.reload();
  row = page.getByRole("row", { name: /교통 정책 과업/ });
  await expect(row).toContainText("진행 중");
  await expect(row.getByRole("link", { name: "진행 보기" })).toHaveAttribute(
    "href",
    `/admin/simulations/status?simulationId=${simulationId}`,
  );

  latestSimulationState = "COMPLETED";
  await page.reload();
  row = page.getByRole("row", { name: /교통 정책 과업/ });
  await expect(row).toContainText("완료");
  await expect(row.getByRole("link", { name: "결과 보기" })).toHaveAttribute(
    "href",
    `/admin/simulations/results?simulationId=${simulationId}`,
  );
});

test("시뮬레이션 결과는 성별 필터·도넛 분포·응답 이유를 한 화면에서 탐색한다", async ({
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

  await page.getByRole("button", { name: "성별", exact: true }).click();
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await expect.poll(() => simulationResultQueries).toContain("?gender=%EC%97%AC%EC%84%B1");
  await expect(page.getByText(/성별 · 여성.*2명/u)).toBeVisible();

  await page.getByRole("button", { name: /다음 결과/u }).click();
  await expect(page.getByText("돌봄 공백을 줄이는 정책이 더 시급합니다.")).toBeVisible();
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

  for (const route of ["/admin/chat/requests", "/admin/chat/categories", "/admin/tasks/create"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${route} must not create page-level horizontal scrolling`,
    ).toBe(true);
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

function taskFixture(status: "DRAFT" | "OPEN", title = "기존 정책 과업") {
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
    absorbedKrw: 0,
    billingState: state === "COMPLETED" ? "SETTLED" : "HELD",
  };
}

function simulationResultFixture(gender: string | null) {
  const isWomen = gender === "여성";
  const optionResults = [
    {
      optionId: "4928e1be-b4ef-45c6-bf83-17641cf4183d",
      displayOrder: 1,
      content: "생활안전 강화",
      count: isWomen ? 1 : 2,
      percentage: isWomen ? 50 : 66.67,
    },
    {
      optionId: "879ba3de-0b84-412b-b51f-e879e9d8f6e2",
      displayOrder: 2,
      content: "돌봄·복지 확대",
      count: 1,
      percentage: isWomen ? 50 : 33.33,
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
    denominators: { total: 3, filtered: isWomen ? 2 : 3 },
    optionResults,
    unansweredCount: 0,
    summary: {
      totalRespondentCount: 3,
      filteredRespondentCount: isWomen ? 2 : 3,
      answeredPersonaCount: isWomen ? 2 : 3,
      unansweredPersonaCount: 0,
      optionResults,
    },
    availableFilters: {
      genders: ["남성", "여성"],
      ageGroups: ["30대", "40대", "50대"],
    },
    resultSlots: isWomen ? [1, 3] : [1, 2, 3],
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
