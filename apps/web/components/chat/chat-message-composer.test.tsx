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

  it("짧은 연결 전환에는 입력창 외형을 유지하되 전송 버튼을 비활성화한다", () => {
    const html = renderComposer({
      disabled: true,
      disabledAppearance: "stable",
      draft: "작성 중인 메시지",
    });
    const form = html.match(/<form[^>]*>/)?.[0];
    const textarea = html.match(/<textarea[^>]*>/)?.[0];
    const button = html.match(/<button[^>]*>/)?.[0];

    expect(form).toContain('data-chat-message-composer-state="disabled-form"');
    expect(form).toContain("bg-white");
    expect(form).not.toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(textarea).toContain("bg-white");
    expect(textarea).not.toContain("bg-transparent");
    expect(textarea).toContain("text-[var(--chat-publishing-color-text)]");
    expect(button).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(button).not.toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("자동 전환 중에는 입력을 허용하고 전송 버튼만 비활성화한다", () => {
    const html = renderComposer({
      canSend: false,
      disabled: false,
      draft: "작성 중인 메시지",
    });
    const textarea = html.match(/<textarea[^>]*>/)?.[0];
    const button = html.match(/<button[^>]*>/)?.[0];

    expect(textarea).not.toContain('disabled=""');
    expect(button).toContain('disabled=""');
    expect(button).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(button).not.toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
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
