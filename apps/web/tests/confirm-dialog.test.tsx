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
    expect(html).toContain("<dialog");
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

  it("확인 문구가 있으면 입력 필드를 표시하고 위험 동작을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        confirmLabel: "채팅방 종료",
        confirmationInputLabel: "종료 확인 문구",
        confirmationPhrase: "종료합니다.",
        description: "모든 연결이 끊깁니다.",
        destructive: true,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        open: true,
        title: "채팅방을 즉시 종료할까요?",
      }),
    );

    expect(html).toContain("종료합니다.");
    expect(html).toContain('aria-label="종료 확인 문구"');
    expect(html).toContain('class="civic-confirm-dialog-confirmation"');
    expect(html).toContain('class="civic-danger-action" disabled=""');
  });
});
