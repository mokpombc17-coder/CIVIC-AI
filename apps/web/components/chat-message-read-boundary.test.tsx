import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessageReadBoundary } from "./chat-message-read-boundary";

describe("ChatMessageReadBoundary", () => {
  it("가상 목록의 읽음 경계를 접근 가능한 separator와 이동 selector로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatMessageReadBoundary
        afterSequence={130}
        renderKey="read-boundary-130"
        style={{ transform: "translateY(24px)" }}
        virtualIndex={3}
      />,
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="여기까지 읽었습니다"');
    expect(html).toContain('data-read-boundary-after-sequence="130"');
    expect(html).toContain('data-render-key="read-boundary-130"');
    expect(html).toContain('data-index="3"');
    expect(html).toContain("여기까지 읽었습니다");
  });
});
