import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageComposer } from "./chat-message-composer";

describe("ChatMessageComposer", () => {
  it("지속되는 비활성 상태의 사유와 중립 상태를 표시한다", () => {
    const html = renderComposer({
      disabled: true,
      disabledMessage: "종료된 토론방에는 메시지를 보낼 수 없습니다.",
    });

    expect(html).toContain('data-chat-message-composer-state="disabled"');
    expect(html).toContain('data-chat-message-composer-state="disabled-form"');
    expect(html).toContain('role="status"');
    expect(html).toContain("종료된 토론방에는 메시지를 보낼 수 없습니다.");
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

  it("메시지 영역과의 간격을 위한 위쪽 margin을 form에 두지 않는다", () => {
    const html = renderComposer();
    const form = html.match(/<form[^>]*>/)?.[0];

    expect(form).toContain("mx-4 mb-4");
    expect(form).not.toContain("mt-");
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
