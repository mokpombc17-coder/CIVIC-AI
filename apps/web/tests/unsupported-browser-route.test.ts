import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../app/unsupported-browser/route";

const IOS_13_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1";
const IOS_16_4_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1";

function createRequest(userAgent: string): Request {
  return new Request("https://civic.example/unsupported-browser", {
    headers: { "user-agent": userAgent },
  });
}

describe("unsupported browser route handler", () => {
  it("returns a plain HTML guide with the normalized environment and no client script", async () => {
    const response = GET(createRequest(IOS_13_SAFARI));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("User-Agent");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(html).toContain('class="civic-home-brand"');
    expect(html).toContain('class="civic-brand-title">CIVIC.AI');
    expect(html).toContain('class="civic-region-badge">전남광주');
    expect(html).toContain('class="platform-stage"');
    expect(html).toContain('class="platform-shell"');
    expect(html).toContain('class="browser-support-card"');
    expect(html).toContain("기기 소프트웨어 또는 브라우저를 업데이트해 주세요");
    expect(html).toContain('class="current-environment-name">iOS 13.7');
    expect(html).toContain("현재 iOS 버전이 지원 기준보다 낮습니다.");
    expect(html).toContain("업데이트를 마치셨나요?");
    expect(html).toContain('<a class="retry-link" href="/home">다시 확인</a>');
    expect(html).not.toContain("업데이트 후 CIVIC.AI에 다시 접속해 주세요.");
    expect(html).not.toContain("<script");
  });

  it("does not interpolate the raw user-agent into the document", async () => {
    const rawMarker = "<script>alert('raw-user-agent')</script>";
    const response = GET(createRequest(`${IOS_13_SAFARI} ${rawMarker}`));

    expect(await response.text()).not.toContain(rawMarker);
  });

  it.each([IOS_16_4_SAFARI, "CIVIC-Test-Browser/1.0"])(
    "redirects supported and unknown direct visits back to home",
    (userAgent) => {
      const response = GET(createRequest(userAgent));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://civic.example/home");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toBe("User-Agent");
    },
  );

  it("keeps the guide stylesheet independent while matching the auth shell", async () => {
    const guideStyles = await readFile(
      path.join(process.cwd(), "apps/web/public/unsupported-browser.css"),
      "utf8",
    );

    expect(guideStyles).toContain('font-family: "Pretendard GOV"');
    expect(guideStyles).toContain(
      "radial-gradient(circle at 10% 0%, rgba(74, 113, 255, 0.13), transparent 30rem)",
    );
    expect(guideStyles).toContain("max-width: 393px");
    expect(guideStyles).toContain("gap: 7px");
    expect(guideStyles).toContain("letter-spacing: -0.6px");
    expect(guideStyles).toContain(".retry-link");
  });
});
