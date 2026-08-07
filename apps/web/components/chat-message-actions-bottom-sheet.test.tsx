import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageActionsBottomSheet } from "./chat-message-actions-bottom-sheet";
import type { ChatMessageActionsBottomSheetViewModel } from "./use-chat-message-actions-bottom-sheet";

describe("ChatMessageActionsBottomSheet", () => {
  it("다른 사용자의 메시지에는 복사 작업만 표시한다", () => {
    const html = renderSheet({ canMutate: false });

    expect(html).toContain(">복사</button>");
    expect(html).not.toContain(">수정</button>");
    expect(html).not.toContain(">삭제</button>");
  });

  it("내 메시지에는 복사·수정·삭제 작업을 함께 표시한다", () => {
    const html = renderSheet({ canMutate: true });

    expect(html).toContain(">복사</button>");
    expect(html).toContain(">수정</button>");
    expect(html).toContain(">삭제</button>");
  });

  it("복사 성공 상태를 접근 가능한 status로 안내한다", () => {
    const html = renderSheet({ copyStatus: "copied" });

    expect(html).toContain(">복사됨</button>");
    expect(html).toContain('role="status"');
    expect(html).toContain("메시지를 클립보드에 복사했습니다.");
  });
});

function renderSheet(overrides: Partial<ChatMessageActionsBottomSheetViewModel>): string {
  const sheet: ChatMessageActionsBottomSheetViewModel = {
    canMutate: true,
    content: "복사할 메시지",
    copyStatus: "idle",
    draft: "복사할 메시지",
    error: null,
    isPending: false,
    isRetryWaiting: false,
    mode: "menu",
    onBackdropClick: vi.fn(),
    onClose: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCopy: vi.fn(),
    onDraftChange: vi.fn(),
    onEditSubmit: vi.fn(),
    onModeChange: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(<ChatMessageActionsBottomSheet sheet={sheet} />);
}
