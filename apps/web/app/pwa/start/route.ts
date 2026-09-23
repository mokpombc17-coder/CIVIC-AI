const PWA_START_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#f5f7fb">
    <meta name="robots" content="noindex, nofollow">
    <title>시작 중 | CIVIC.AI</title>
    <link rel="stylesheet" href="/pwa-start/start.css">
    <script defer src="/pwa-start/start.js"></script>
  </head>
  <body>
    <main class="civic-pwa-startup" data-pwa-startup-state="checking">
      <section aria-live="polite" class="civic-pwa-startup-content" role="status">
        <h1 class="civic-pwa-splash-wordmark">CIVIC.AI</h1>
        <p data-pwa-startup-message>로그인 상태를 확인하고 있습니다.</p>
        <button class="civic-pwa-retry" data-pwa-startup-retry hidden type="button">
          다시 시도
        </button>
      </section>
    </main>
  </body>
</html>
`;

export function GET() {
  return new Response(PWA_START_HTML, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
