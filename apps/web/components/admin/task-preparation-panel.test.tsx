import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskPreparationPanel } from "@/components/admin/admin-task-screen";
import type { TaskPreparationStatus, TaskPreparationView } from "@/lib/admin/domain-contracts";

const preparation = (
  status: TaskPreparationStatus,
  processingStartedAt = "2026-09-05T00:00:00Z",
): TaskPreparationView => ({
  status,
  requestId: "request-1",
  contentFingerprint: `sha256:${"a".repeat(64)}`,
  attemptCount: 2,
  updatedAt: "2026-09-05T01:00:00Z",
  processingStartedAt,
  preparedAt: status === "READY" ? "2026-09-05T01:00:00Z" : null,
  lastError:
    status === "FAILED" || status === "REJECTED"
      ? { code: "MODEL_ERROR", detail: "모델 응답 오류", retryable: status === "FAILED" }
      : null,
});
function render(
  status: TaskPreparationStatus,
  canStart = false,
  pending = false,
  processingStartedAt?: string,
) {
  return renderToStaticMarkup(
    <TaskPreparationPanel
      preparation={preparation(status, processingStartedAt)}
      capabilities={{
        canEditContent: true,
        canStartPreparation: canStart,
        canSchedule: status === "READY",
        canOpenNow: status === "READY",
      }}
      pending={pending}
      onStart={() => undefined}
    />,
  );
}
describe("AI 예상 답변 생성 패널", () => {
  it("생성 중에는 자동 갱신 안내와 시작 시각을 보여주고 중복 요청 버튼을 숨긴다", () => {
    const html = render("PROCESSING");
    expect(html).toContain("AI 예상 답변 생성");
    expect(html).toContain("상태는 자동으로 갱신");
    expect(html).toContain("생성 시작");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<progress");
  });
  it("lease가 지나 재요청이 허용돼도 지연 전에는 생성 중으로 두고 버튼을 숨긴다", () => {
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const html = render("PROCESSING", true, false, startedAt);
    expect(html).toContain(">생성 중</span>");
    expect(html).not.toContain("재시도 필요");
    expect(html).not.toContain("오래 걸리고");
    expect(html).not.toContain("<button");
  });
  it("30분 지연 뒤에는 생성 중을 유지하며 다시 요청을 제공한다", () => {
    const startedAt = new Date(Date.now() - 40 * 60_000).toISOString();
    const html = render("PROCESSING", true, false, startedAt);
    expect(html).toContain(">생성 중</span>");
    expect(html).not.toContain("재시도 필요");
    expect(html).toContain("다시 요청해도 진행 중인 작업을 이어서 확인합니다.");
    expect(html).toContain(">다시 요청</button>");
  });
  it("지연됐어도 서버가 재요청을 허용하지 않으면 운영 확인만 안내한다", () => {
    const startedAt = new Date(Date.now() - 40 * 60_000).toISOString();
    const html = render("PROCESSING", false, false, startedAt);
    expect(html).toContain("운영 담당자에게 확인을 요청해 주세요.");
    expect(html).not.toContain("<button");
  });
  it("실패 원인은 접힌 상세로 보여주고 요청 중에는 중복 클릭을 막는다", () => {
    const html = render("FAILED", true, true);
    expect(html).toContain("<details");
    expect(html).toContain("오류 상세 보기");
    expect(html).toContain("disabled");
    expect(html).toContain("요청 중…");
  });
  it("완료 후 발행을 안내하며 완료 시각을 표시한다", () => {
    const html = render("READY");
    expect(html).toContain("생성 완료");
    expect(html).toContain("바로 시작하거나 예약");
    expect(html).not.toContain("<button");
  });
  it("재시도 불가 상태에는 수정 안내만 제공한다", () => {
    const html = render("REJECTED");
    expect(html).toContain("내용 확인 필요");
    expect(html).toContain("투표 내용을 수정");
    expect(html).not.toContain("<button");
  });
});
