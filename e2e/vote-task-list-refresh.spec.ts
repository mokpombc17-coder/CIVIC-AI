import { expect, test, type Page } from "@playwright/test";
import { issueLocalE2EAuthenticationSession } from "./chat-e2e-helpers";

type OpenTaskSummary = Readonly<{
  closesAt: string;
  description: string | null;
  openedAt: string;
  submission: Readonly<{ submitted: false; submissionId: null; submittedAt: null }>;
  taskId: string;
  title: string;
}>;

test("진행 중 목록을 켜 둔 채 1분이 지나면 새로 발행된 투표가 나타난다", async ({ page }) => {
  await issueLocalE2EAuthenticationSession(page.request, "local-user-1");
  await page.clock.install();
  const publishedTasks: OpenTaskSummary[] = [];
  await appendToOpenTasks(page, () => publishedTasks);

  await page.goto("/vote");
  await expect(page.getByRole("link", { name: / (참여하기|응답 보기)$/ }).first()).toBeVisible();

  const now = await page.evaluate(() => Date.now());
  const publishedTask = createOpenTask("목록을 켜 둔 동안 발행된 투표", now + 86_400_000, now);
  publishedTasks.push(publishedTask);
  await expect(getTaskLink(page, publishedTask)).toHaveCount(0);

  await page.clock.fastForward(61_000);

  await expect(getTaskLink(page, publishedTask)).toBeVisible();
});

test("진행 중 투표의 마감 시각이 지나면 1분을 기다리지 않고 목록에서 빠진다", async ({ page }) => {
  await issueLocalE2EAuthenticationSession(page.request, "local-user-1");
  await page.clock.install();
  const now = await page.evaluate(() => Date.now());
  const closingTask = createOpenTask("곧 마감되는 투표", now + 10_000, now);
  let closed = false;
  await appendToOpenTasks(page, () => (closed ? [] : [closingTask]));

  await page.goto("/vote");
  await expect(getTaskLink(page, closingTask)).toBeVisible();

  // 서버가 마감을 반영해 더는 진행 중 목록에 내려주지 않는 상황
  closed = true;
  await page.clock.fastForward(13_000);

  await expect(getTaskLink(page, closingTask)).toHaveCount(0);
});

async function appendToOpenTasks(page: Page, getTasks: () => readonly OpenTaskSummary[]) {
  await page.route(
    (url) => url.pathname.endsWith("/me/tasks"),
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const response = await route.fetch();
      const body = (await response.json()) as unknown[];
      await route.fulfill({ json: [...getTasks(), ...body], response });
    },
  );
}

function createOpenTask(title: string, closesAt: number, openedAt: number): OpenTaskSummary {
  return {
    closesAt: new Date(closesAt).toISOString(),
    description: null,
    openedAt: new Date(openedAt).toISOString(),
    submission: { submitted: false, submissionId: null, submittedAt: null },
    taskId: crypto.randomUUID(),
    title: `${title} ${crypto.randomUUID().slice(0, 8)}`,
  };
}

function getTaskLink(page: Page, task: OpenTaskSummary) {
  return page.getByRole("link", { name: `${task.title} 참여하기`, exact: true });
}
