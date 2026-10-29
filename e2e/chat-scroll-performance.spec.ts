import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  authenticateLocalE2EUserAs,
  createE2ERoomName,
  createRoomAndEnter,
} from "./chat-e2e-helpers";

// 채팅 메시지 목록을 스크롤할 때 스크롤 이벤트 처리 시간과 그 안의 강제 레이아웃을 Chromium trace로 잼
// 결과 해석과 실행 순서는 docs/architecture/chat-message-viewport.md의 성능 판단 항목에 둠

const OUTPUT_DIRECTORY = path.join(process.cwd(), "e2e/.artifacts/chat-scroll-performance");
const PHASE = process.env.CHAT_SCROLL_PERF_PHASE;
const STATE_FILE = process.env.CHAT_SCROLL_PERF_STATE ?? path.join(OUTPUT_DIRECTORY, "state.json");
const CPU_THROTTLING_RATE = Number(process.env.CHAT_SCROLL_PERF_CPU ?? "6");
const MESSAGE_COUNT = 60;
const ACTIVE_ROOM_LABEL = "채팅 가능";
const SCROLL_ROUNDS = 2;
const WHEEL_STEPS_PER_DIRECTION = 15;
const WHEEL_DELTA = 120;
const LONG_TASK_US = 50_000;

type MeasurementState = Readonly<{
  cookies: Parameters<BrowserContext["addCookies"]>[0];
  roomId: string;
  roomPath: string;
  searchQuery: string;
}>;

type TraceEvent = Readonly<{
  args?: { data?: { type?: string } };
  dur?: number;
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
}>;

// 성능 측정은 production 빌드를 따로 띄워야 해서 평소 e2e에서는 실행하지 않음
test.skip(
  PHASE !== "setup" && PHASE !== "measure",
  "스크롤 성능은 CHAT_SCROLL_PERF_PHASE=setup 또는 measure로 직접 실행합니다.",
);

test("채팅 메시지 목록 스크롤 성능을 잰다", async ({ browser, context, page }) => {
  // 방 준비에 메시지 60개를 보내야 해서 기본 제한 시간보다 길게 둠
  test.setTimeout(400_000);

  if (PHASE === "setup") {
    await prepareRoom(context, page);
    return;
  }

  // production 빌드에서는 로컬 E2E 로그인이 막혀 있어 준비 단계에서 저장한 쿠키로 같은 방에 들어감
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as MeasurementState;
  await context.addCookies(state.cookies);
  await page.goto(state.roomPath);
  await expect(page.getByText(ACTIVE_ROOM_LABEL, { exact: true })).toBeVisible();

  const messageLog = page.getByRole("log", { name: `${state.roomId} 메시지` });
  const cdp = await context.newCDPSession(page);
  // 첫 화면의 이력 조회와 위치 잡기가 끝난 뒤에 재도록 잠시 기다림
  await page.waitForTimeout(1_500);
  const live = await measureScroll(browser, page, cdp, messageLog);

  await openSearchResult(page, state.searchQuery, messageLog);
  await page.waitForTimeout(1_500);
  const messageContext = await measureScroll(browser, page, cdp, messageLog);

  const result = {
    cpuThrottlingRate: CPU_THROTTLING_RATE,
    measuredAt: new Date().toISOString(),
    origin: new URL(page.url()).origin,
    live,
    messageContext,
  };
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const outputFile =
    process.env.CHAT_SCROLL_PERF_OUT ??
    path.join(OUTPUT_DIRECTORY, `result-${result.measuredAt.replaceAll(":", "-")}.json`);
  writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`결과: ${outputFile}`);
  console.log(JSON.stringify(result, null, 2));
});

async function prepareRoom(context: BrowserContext, page: Page): Promise<void> {
  const uniqueId = crypto.randomUUID();
  const searchQuery = `성능표적-${uniqueId.slice(0, 8)}`;
  await authenticateLocalE2EUserAs(page, context, `e2e-scroll-performance-${uniqueId}`);
  const roomId = await createRoomAndEnter(page, createE2ERoomName("perf"));
  const messageLog = page.getByRole("log", { name: `${roomId} 메시지` });
  const messageInput = page.getByRole("textbox", { name: "메시지" });
  await expect(messageInput).toBeEnabled();

  // 첫 메시지만 검색어를 넣어 최신 이력 밖의 검색 결과로 이동한 대화를 열 수 있게 함
  for (let index = 0; index < MESSAGE_COUNT; index += 1) {
    const content =
      index === 0 ? `${searchQuery} 첫 메시지` : `perf-${index + 1}-${uniqueId.slice(0, 8)}`;
    await messageInput.fill(content);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(messageLog.getByText(content, { exact: true })).toBeVisible();
    // 50자를 넘지 않는 메시지를 1.1초 간격으로 보내야 전송 rate limit에 걸리지 않음
    await page.waitForTimeout(1_100);
  }

  const state: MeasurementState = {
    cookies: await context.cookies(),
    roomId,
    roomPath: new URL(page.url()).pathname,
    searchQuery,
  };
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
  console.log(`준비한 방 정보: ${STATE_FILE}`);
}

async function openSearchResult(
  page: Page,
  searchQuery: string,
  messageLog: Locator,
): Promise<void> {
  await page.getByRole("button", { name: "메시지 검색", exact: true }).click();
  const searchBox = page
    .locator('[data-chat-room-message-search-panel="true"]')
    .getByRole("search")
    .getByRole("searchbox", { name: "메시지 내용" });
  await searchBox.fill(searchQuery);
  await searchBox.press("Enter");
  await expect(messageLog.locator('[data-navigation-target="true"]')).toBeVisible();
}

async function measureScroll(browser: Browser, page: Page, cdp: CDPSession, messageLog: Locator) {
  const box = await messageLog.boundingBox();

  if (!box) {
    throw new Error("메시지 목록 위치를 찾지 못했습니다.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLING_RATE });
  await browser.startTracing(page, {
    categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"],
  });

  try {
    // 사용자 입력과 같은 경로를 타도록 wheel 입력으로 위아래를 번갈아 스크롤함
    for (let round = 0; round < SCROLL_ROUNDS; round += 1) {
      for (const direction of [-1, 1]) {
        for (let step = 0; step < WHEEL_STEPS_PER_DIRECTION; step += 1) {
          await page.mouse.wheel(0, direction * WHEEL_DELTA);
          await page.waitForTimeout(60);
        }
      }
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }

  const trace = JSON.parse((await browser.stopTracing()).toString()) as {
    traceEvents: TraceEvent[];
  };
  return analyzeTrace(trace.traceEvents);
}

function analyzeTrace(events: readonly TraceEvent[]) {
  const scrollDispatches = events.filter(
    (event) =>
      event.name === "EventDispatch" && event.ph === "X" && event.args?.data?.type === "scroll",
  );
  const layoutEvents = events.filter(
    (event) =>
      (event.name === "Layout" || event.name === "UpdateLayoutTree") &&
      event.ph === "X" &&
      event.dur !== undefined,
  );
  // 스크롤 이벤트 처리 안에서 일어난 레이아웃·스타일 계산은 코드가 위치를 읽느라 강제로 일으킨 것임
  const perScroll = scrollDispatches.map((dispatch) => {
    const end = dispatch.ts + (dispatch.dur ?? 0);
    const forcedUs = layoutEvents
      .filter(
        (event) =>
          event.pid === dispatch.pid &&
          event.tid === dispatch.tid &&
          event.ts >= dispatch.ts &&
          event.ts + (event.dur ?? 0) <= end,
      )
      .reduce((sum, event) => sum + (event.dur ?? 0), 0);

    return { forcedMs: forcedUs / 1000, totalMs: (dispatch.dur ?? 0) / 1000 };
  });
  const mainThreadId = scrollDispatches[0]?.tid;
  const longTasks = events.filter(
    (event) =>
      event.name === "RunTask" &&
      event.ph === "X" &&
      event.tid === mainThreadId &&
      (event.dur ?? 0) > LONG_TASK_US,
  );

  return {
    scrollEvents: perScroll.length,
    scrollDispatchMs: summarize(perScroll.map((entry) => entry.totalMs)),
    forcedLayoutMs: summarize(perScroll.map((entry) => entry.forcedMs)),
    scrollsWithForcedLayout: perScroll.filter((entry) => entry.forcedMs > 0).length,
    longTasksOver50ms: longTasks.length,
  };
}

function summarize(values: readonly number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))] ?? 0;

  return {
    max: roundMs(sorted.at(-1) ?? 0),
    median: roundMs(at(0.5)),
    p95: roundMs(at(0.95)),
    sum: roundMs(sorted.reduce((sum, value) => sum + value, 0)),
  };
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
