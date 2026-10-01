import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../app/supported-browsers/route";

const IOS_13_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1";
const IOS_16_4_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1";

function createRequest(userAgent: string): Request {
  return new Request("https://civic.example/supported-browsers", {
    headers: { "user-agent": userAgent },
  });
}

describe("browser support status route handler", () => {
  it("shows the update guide and retry action for an unsupported environment", async () => {
    const response = GET(createRequest(IOS_13_SAFARI));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("User-Agent");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(html).toContain('data-support-status="unsupported"');
    expect(html).toContain("기기 소프트웨어 또는 브라우저를 업데이트해 주세요");
    expect(html).toContain('class="current-environment-name">iOS 13.7');
    expect(html).toContain("현재 iOS 버전이 지원 기준보다 낮습니다.");
    expect(html).toContain("업데이트를 마치셨나요?");
    expect(html).toContain('<a class="retry-link" href="/supported-browsers">확인하기</a>');
    expect(html).toContain('class="update-guide"');
    expect(html).not.toContain("<script");
  });

  it("shows a supported status and home action instead of redirecting", async () => {
    const response = GET(createRequest(IOS_16_4_SAFARI));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(html).toContain('data-support-status="supported"');
    expect(html).toContain("지원되는 환경입니다");
    expect(html).toContain('class="current-environment-name">iOS 16.4');
    expect(html).toContain("현재 환경은 지원 기준을 충족합니다.");
    expect(html).not.toContain("CIVIC.AI를 계속 이용하시겠어요?");
    expect(html).toContain('<a class="retry-link" href="/home">홈으로 이동</a>');
    expect(html).not.toContain('class="update-guide"');
  });

  it("shows an allowed unknown status and home action instead of redirecting", async () => {
    const response = GET(createRequest("CIVIC-Test-Browser/1.0"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(html).toContain('data-support-status="unknown"');
    expect(html).toContain("현재 환경의 지원 여부를 자동으로 확인하기 어렵습니다");
    expect(html).toContain('class="current-environment-name">확인할 수 없는 환경');
    expect(html).toContain("서비스 이용을 제한하지 않습니다.");
    expect(html).toContain('<a class="retry-link" href="/home">이동하기</a>');
    expect(html).not.toContain('class="update-guide"');
  });

  it("shows the current environment before the supported version", async () => {
    const html = await GET(createRequest(IOS_16_4_SAFARI)).text();

    expect(html.indexOf("현재 접속 환경")).toBeLessThan(html.indexOf("지원 버전"));
  });

  it("does not interpolate the raw user-agent into the document", async () => {
    const rawMarker = "<script>alert('raw-user-agent')</script>";
    const response = GET(createRequest(`${IOS_13_SAFARI} ${rawMarker}`));

    expect(await response.text()).not.toContain(rawMarker);
  });

  it("keeps the status page independent while matching the auth shell", async () => {
    const guideStyles = await readFile(
      path.join(process.cwd(), "apps/web/public/supported-browsers.css"),
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
    expect(guideStyles).toMatch(/\.support-baseline strong\s*\{[^}]*color: #59616b;/);
    expect(guideStyles).toContain(
      '.browser-support-card[data-support-status="supported"] .recheck',
    );
    expect(guideStyles).toContain("margin-top: 8px");
  });
});
