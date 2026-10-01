import {
  classifyBrowserSupport,
  type BrowserSupportResult,
  type UnsupportedBrowserReason,
} from "../../lib/browser-support";

export const dynamic = "force-dynamic";

const BROWSER_SUPPORT_CONTENT_SECURITY_POLICY = [
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

const STATUS_CONTENT = {
  supported: {
    title: "이용할 수 있는 환경입니다",
    description: "현재 기기 소프트웨어 또는 브라우저가 CIVIC.AI 지원 기준을 충족합니다.",
    statusMessage: null,
    prompt: null,
    actionLabel: "홈으로 이동",
    actionHref: "/home",
  },
  unknown: {
    title: "현재 환경의 지원 여부를 자동으로 확인하기 어렵습니다",
    description:
      "브라우저 정보를 충분히 확인할 수 없지만 서비스 이용을 제한하지 않습니다. 화면이나 기능에 문제가 있으면 최신 버전으로 업데이트해 주세요.",
    statusMessage: "현재 환경은 자동 판정 대상이 아니며 서비스 이용을 제한하지 않습니다.",
    prompt: "CIVIC.AI 이용을 계속할 수 있습니다.",
    actionLabel: "이동하기",
    actionHref: "/home",
  },
  unsupported: {
    title: "업데이트가 필요한 환경입니다",
    description:
      "현재 환경에서는 일부 화면이나 기능이 정상적으로 표시되거나 동작하지 않을 수 있습니다. 원활한 이용을 위해 최신 버전으로 업데이트해 주세요.",
    prompt: "업데이트를 마치셨나요?",
    actionLabel: "확인하기",
    actionHref: "/supported-browsers",
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getEnvironmentLabel(result: BrowserSupportResult): string {
  const environment = result.environment.os ?? result.environment.browser;

  if (!environment) {
    return "확인할 수 없는 환경";
  }

  return [environment.name, environment.version].filter(Boolean).join(" ");
}

function getStatusMessage(result: BrowserSupportResult): string | null {
  if (result.support === "supported") {
    return STATUS_CONTENT.supported.statusMessage;
  }

  if (result.support === "unknown") {
    return STATUS_CONTENT.unknown.statusMessage;
  }

  if (result.reason === "ios-version" && result.environment.os?.name === "iPadOS") {
    return "현재 iPadOS 버전이 지원 기준보다 낮습니다.";
  }

  return REASON_MESSAGES[result.reason];
}

function renderUpdateGuide(result: BrowserSupportResult): string {
  if (result.support !== "unsupported") {
    return "";
  }

  return `
                <div class="update-guide">
                  <p>
                    <strong>iPhone·iPad</strong> iOS 또는 iPadOS를 최신 버전으로 업데이트해 주세요.
                  </p>
                  <p>
                    <strong>그 외 기기</strong> Safari, Chrome, Edge 또는 Firefox를 최신 버전으로
                    업데이트해 주세요.
                  </p>
                </div>`;
}

export function renderBrowserSupportHtml(result: BrowserSupportResult): string {
  const content = STATUS_CONTENT[result.support];
  const environmentLabel = escapeHtml(getEnvironmentLabel(result));
  const statusMessage = getStatusMessage(result);
  const statusMessageMarkup = statusMessage
    ? `<p class="current-environment-reason">${escapeHtml(statusMessage)}</p>`
    : "";
  const updateGuide = renderUpdateGuide(result);
  const prompt = content.prompt ? `<p>${escapeHtml(content.prompt)}</p>` : "";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <title>브라우저 지원 상태 | CIVIC.AI</title>
    <link rel="stylesheet" href="/supported-browsers.css" />
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
              <section
                class="browser-support-card"
                data-support-status="${result.support}"
                aria-labelledby="browser-support-title"
              >
                <header class="browser-support-card-heading">
                  <h1 id="browser-support-title">${escapeHtml(content.title)}</h1>
                </header>
                <p class="description">${escapeHtml(content.description)}</p>

                <section class="current-environment" aria-labelledby="current-environment-title">
                  <h2 id="current-environment-title">현재 접속 환경</h2>
                  <p class="current-environment-name">${environmentLabel}</p>
                  ${statusMessageMarkup}
                </section>

                <div class="support-baseline">
                  <strong>지원 기준</strong>
                  <span>iPhone·iPad — iOS·iPadOS 16.4 이상</span>
                  <span>Safari — 16.4 이상</span>
                  <span>Chrome·Edge·Firefox — 111 이상</span>
                </div>
${updateGuide}

                <div class="recheck">
                  ${prompt}
                  <a class="retry-link" href="${content.actionHref}">${escapeHtml(
                    content.actionLabel,
                  )}</a>
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
    "content-security-policy": BROWSER_SUPPORT_CONTENT_SECURITY_POLICY,
    "content-type": "text/html; charset=utf-8",
    vary: "User-Agent",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
}

export function GET(request: Request): Response {
  const result = classifyBrowserSupport(request.headers.get("user-agent") ?? "");

  return new Response(renderBrowserSupportHtml(result), {
    status: 200,
    headers: responseHeaders(),
  });
}
