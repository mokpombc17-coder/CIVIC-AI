import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdownAnswer } from "./safe-markdown-answer";

describe("SafeMarkdownAnswer", () => {
  it("renders Inha-style headings, emphasis, lists, and inline code", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer={"### 신청 안내\n\n**신청 기한**은 `3월 15일`입니다.\n\n- 재학생\n- 휴학생"}
      />,
    );

    expect(html).toContain("<h3>신청 안내</h3>");
    expect(html).toContain("<strong>신청 기한</strong>");
    expect(html).toContain("<code>3월 15일</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>재학생</li>");
    expect(html).toContain("<li>휴학생</li>");
  });

  it("never interprets provider HTML", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer={'<img src=x onerror="alert(1)">'} />,
    );

    expect(html).not.toContain("<img");
  });
});
