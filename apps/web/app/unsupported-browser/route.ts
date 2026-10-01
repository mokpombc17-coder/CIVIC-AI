import {
  classifyBrowserSupport,
  type BrowserSupportResult,
  type UnsupportedBrowserReason,
} from "../../lib/browser-support";

export const dynamic = "force-dynamic";

const UNSUPPORTED_BROWSER_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "script-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

const REASON_MESSAGES: Record<UnsupportedBrowserReason, string> = {
  "ios-version": "현재 iOS 버전이 지원 기준보다 낮습니다.",
  "safari-version": "현재 Safari 버전이 지원 기준보다 낮습니다.",
  "chrome-version": "현재 Chrome 버전이 지원 기준보다 낮습니다.",
  "edge-version": "현재 Edge 버전이 지원 기준보다 낮습니다.",
  "firefox-version": "현재 Firefox 버전이 지원 기준보다 낮습니다.",
};

type UnsupportedBrowserResult = Extract<BrowserSupportResult, { support: "unsupported" }>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getEnvironmentLabel(result: UnsupportedBrowserResult): string {
  const environment = result.environment.os ?? result.environment.browser;

  if (!environment) {
    return "지원되지 않는 환경";
  }

  return [environment.name, environment.version].filter(Boolean).join(" ");
}

function getReasonMessage(result: UnsupportedBrowserResult): string {
  if (result.reason === "ios-version" && result.environment.os?.name === "iPadOS") {
    return "현재 iPadOS 버전이 지원 기준보다 낮습니다.";
  }

  return REASON_MESSAGES[result.reason];
}

export function renderUnsupportedBrowserHtml(result: UnsupportedBrowserResult): string {
  const environmentLabel = escapeHtml(getEnvironmentLabel(result));
  const reasonMessage = escapeHtml(getReasonMessage(result));

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <title>브라우저 업데이트 안내 | CIVIC.AI</title>
    <link rel="stylesheet" href="/unsupported-browser.css" />
  </head>
  <body>
    <div class="platform-stage">
      <div class="platform-shell">
        <div class="platform-surface">
          <header class="browser-support-header">
            <div class="browser-support-header-row">
              <span aria-label="CIVIC.AI 전남광주" class="civic-home-brand">
                <span class="civic-brand-title">CIVIC.AI</span>
                <span class="civic-region-badge">전남광주</span>
              </span>
            </div>
          </header>

          <main class="browser-support-content">
            <div class="browser-support-page">
              <section class="browser-support-card" aria-labelledby="browser-support-title">
                <header class="browser-support-card-heading">
                  <h1 id="browser-support-title">
                    기기 소프트웨어 또는 브라우저를 업데이트해 주세요
                  </h1>
                </header>
                <p class="description">
                  현재 환경에서는 일부 화면이나 기능이 정상적으로 표시되거나 동작하지 않을 수
                  있습니다. 원활한 이용을 위해 최신 버전으로 업데이트해 주세요.
                </p>

                <section class="current-environment" aria-labelledby="current-environment-title">
                  <h2 id="current-environment-title">현재 접속 환경</h2>
                  <p class="current-environment-name">${environmentLabel}</p>
                  <p class="current-environment-reason">${reasonMessage}</p>
                </section>

                <div class="support-baseline">
                  <strong>지원 버전</strong>
                  <span>iOS·iPadOS 및 Safari 16.4 이상</span>
                  <span>Chrome·Edge·Firefox 111 이상</span>
                </div>

                <div class="update-guide">
                  <p>
                    <strong>iPhone·iPad</strong> iOS 또는 iPadOS를 최신 버전으로 업데이트해 주세요.
                  </p>
                  <p>
                    <strong>그 외 기기</strong> Safari, Chrome, Edge 또는 Firefox를 최신 버전으로
                    업데이트해 주세요.
                  </p>
                </div>

                <div class="recheck">
                  <p>업데이트를 마치셨나요?</p>
                  <a class="retry-link" href="/home">다시 확인</a>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function responseHeaders(): Headers {
  return new Headers({
    "cache-control": "private, no-store",
    "content-language": "ko",
    "content-security-policy": UNSUPPORTED_BROWSER_CONTENT_SECURITY_POLICY,
    "content-type": "text/html; charset=utf-8",
    vary: "User-Agent",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
}

export function GET(request: Request): Response {
  const result = classifyBrowserSupport(request.headers.get("user-agent") ?? "");

  if (result.support !== "unsupported") {
    return new Response(null, {
      status: 307,
      headers: {
        "cache-control": "private, no-store",
        location: new URL("/home", request.url).toString(),
        vary: "User-Agent",
      },
    });
  }

  return new Response(renderUnsupportedBrowserHtml(result), {
    status: 200,
    headers: responseHeaders(),
  });
}
