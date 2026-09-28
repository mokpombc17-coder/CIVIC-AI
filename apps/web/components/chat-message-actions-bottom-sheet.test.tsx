import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageActionsBottomSheet } from "./chat-message-actions-bottom-sheet";
import type { ChatMessageActionsBottomSheetViewModel } from "./use-chat-message-actions-bottom-sheet";

describe("ChatMessageActionsBottomSheet", () => {
  it("다른 사용자의 메시지에는 복사 작업만 표시한다", () => {
    const html = renderSheet({ canMutate: false });

    expect(html).toContain(">복사</span>");
    expect(html).not.toContain(">수정</span>");
    expect(html).not.toContain(">삭제</span>");
    expect(html).toContain("grid-cols-1");
  });

  it("내 메시지는 복사·수정·삭제 작업을 한 줄로 표시한다", () => {
    const html = renderSheet({ canMutate: true });

    expect(html).toContain(">복사</span>");
    expect(html).toContain(">수정</span>");
    expect(html).toContain(">삭제</span>");
    expect(html).toContain("grid-cols-3");
    expect(html).not.toContain("divide-y");
    expect(html).not.toContain("border-y");
  });

  it("복사 성공 상태를 접근 가능한 status로 안내한다", () => {
    const html = renderSheet({ copyStatus: "copied" });

    expect(html).toContain(">복사됨</span>");
    expect(html).toContain('role="status"');
    expect(html).toContain("메시지를 클립보드에 복사했습니다.");
  });

  it("메시지 본문은 여러 줄로 표시하고 길어지면 미리보기 영역만 스크롤한다", () => {
    const html = renderSheet({ content: "첫 번째 줄\n두 번째 줄" });

    expect(html).toContain("첫 번째 줄\n두 번째 줄");
    expect(html).toContain("max-h-32");
    expect(html).toContain("overflow-y-auto whitespace-pre-wrap");
    expect(html).toContain("선택한 메시지");
    expect(html).toContain("border-[var(--chat-publishing-color-border)]");
    expect(html).not.toContain("line-clamp");
    expect(html).not.toContain("sm:grid-cols");
    expect(html).not.toContain("h-1 w-10 rounded-full bg-slate-300");
    expect(html).not.toContain("secondary-button");
    expect(html).not.toContain("primary-button");
  });

  it("수정 상태에서는 선택한 메시지 박스를 textarea로 전환한다", () => {
    const editHtml = renderSheet({ error: "메시지 내용을 입력해 주세요.", mode: "edit" });

    expect(editHtml).toContain("메시지 수정");
    expect(editHtml).toContain("선택한 메시지");
    expect(editHtml).toContain("메시지 내용을 입력해 주세요.");
    expect(editHtml).toContain('data-chat-message-edit-input="true"');
    expect(editHtml).toContain("resize-none");
    expect(editHtml).not.toContain("resize-y");
    expect(editHtml).not.toContain('data-chat-message-preview="true"');
    expect(editHtml).not.toContain("수정할 내용");
    expect(editHtml.indexOf('role="alert"')).toBeLessThan(editHtml.indexOf("선택한 메시지"));
  });

  it("삭제 상태에서는 선택한 메시지와 삭제 확인 영역을 표시한다", () => {
    const deleteHtml = renderSheet({ mode: "delete" });

    expect(deleteHtml).toContain("메시지 삭제");
    expect(deleteHtml).toContain('data-chat-message-preview="true"');
    expect(deleteHtml).toContain("이 메시지를 삭제할까요?");
    expect(deleteHtml).toContain("bg-[#fff1f0]");
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
