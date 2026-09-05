import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskPreparationPanel } from "@/components/admin/admin-task-screen";
import type { TaskPreparationStatus, TaskPreparationView } from "@/lib/admin/domain-contracts";

const preparation = (status: TaskPreparationStatus): TaskPreparationView => ({
  status,
  requestId: "request-1",
  contentFingerprint: `sha256:${"a".repeat(64)}`,
  attemptCount: 2,
  updatedAt: "2026-09-05T01:00:00Z",
  processingStartedAt: "2026-09-05T00:00:00Z",
  preparedAt: status === "READY" ? "2026-09-05T01:00:00Z" : null,
  lastError:
    status === "FAILED" || status === "REJECTED"
      ? { code: "MODEL_ERROR", detail: "모델 응답 오류", retryable: status === "FAILED" }
      : null,
});
function render(status: TaskPreparationStatus, canStart = false, pending = false) {
  return renderToStaticMarkup(
    <TaskPreparationPanel
      preparation={preparation(status)}
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
  it("재요청이 허용된 장기 처리도 재시도 필요로 표시한다", () => {
    const html = render("PROCESSING", true);
    expect(html).toContain("재시도 필요");
    expect(html).toContain(">답변 생성 다시 시도</button>");
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
