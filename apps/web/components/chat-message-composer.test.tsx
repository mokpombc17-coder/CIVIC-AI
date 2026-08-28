import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageComposer } from "./chat-message-composer";

describe("ChatMessageComposer", () => {
  it("준비 중인 입력창에 비활성 사유와 중립 상태를 표시한다", () => {
    const html = renderComposer({
      disabled: true,
      disabledMessage: "채팅 준비가 끝나면 입력할 수 있습니다.",
    });

    expect(html).toContain('data-chat-message-composer-state="disabled"');
    expect(html).toContain('data-chat-message-composer-state="disabled-form"');
    expect(html).toContain('role="status"');
    expect(html).toContain("채팅 준비가 끝나면 입력할 수 있습니다.");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
  });

  it("입력 검증 오류와 전송 가능한 상태를 플랫폼 색상으로 표시한다", () => {
    const html = renderComposer({
      canSend: true,
      disabled: false,
      draft: "메시지",
      validationError: "메시지는 2,000자 이하여야 합니다.",
    });

    expect(html).toContain('data-chat-message-composer-state="validation-error"');
    expect(html).toContain('data-chat-message-composer-state="ready"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html).not.toContain("bg-red-50");
  });
});

function renderComposer(
  overrides: Partial<Parameters<typeof ChatMessageComposer>[0]> = {},
): string {
  return renderToStaticMarkup(
    <ChatMessageComposer
      canSend={false}
      disabled={false}
      draft=""
      inputId="chat-message-room-01"
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="메시지를 입력해 주세요."
      validationError={null}
      {...overrides}
    />,
  );
}
