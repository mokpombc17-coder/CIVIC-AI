import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

describe("ConfirmDialog", () => {
  it("닫힌 상태에서는 대화상자를 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        confirmLabel: "삭제",
        description: "삭제 설명",
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        open: false,
        title: "삭제할까요?",
      }),
    );

    expect(html).toBe("");
  });

  it("제목과 설명으로 식별되는 위험 확인 대화상자를 렌더링한다", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        cancelLabel: "유지",
        confirmLabel: "삭제",
        description: "삭제 후에는 되돌릴 수 없습니다.",
        destructive: true,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        open: true,
        title: "삭제할까요?",
      }),
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-confirm-dialog="true"');
    expect(html).toContain("삭제할까요?");
    expect(html).toContain("삭제 후에는 되돌릴 수 없습니다.");
    expect(html).toContain('class="civic-secondary-action"');
    expect(html).toContain('class="civic-danger-action"');
    expect(html).toContain(">유지</button>");
    expect(html).toContain(">삭제</button>");
  });

  it("처리 중에는 양쪽 버튼을 비활성화하고 진행 문구를 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        busy: true,
        busyLabel: "삭제 중…",
        confirmLabel: "삭제",
        description: "삭제 설명",
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        open: true,
        title: "삭제할까요?",
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/gu)).toHaveLength(2);
    expect(html).toContain("삭제 중…");
  });
});
