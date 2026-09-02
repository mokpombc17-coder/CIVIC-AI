const ALLOWED_EMBED_ORIGINS = new Set(["https://postcode.map.kakao.com"]);

export function isMainDocumentHttpError(errorUrl: string, currentDocumentUrl: string): boolean {
  try {
    const error = new URL(errorUrl);
    const current = new URL(currentDocumentUrl);
    error.hash = "";
    current.hash = "";
    return error.href === current.href;
  } catch {
    return false;
  }
}

export function shouldAllowWebViewNavigation({
  isTopFrame,
  url,
  webAppOrigin,
}: Readonly<{
  isTopFrame: boolean;
  url: string;
  webAppOrigin: string;
}>): boolean {
  if (url === "about:blank" || url.startsWith(`blob:${webAppOrigin}`)) return true;

  try {
    const origin = new URL(url).origin;
    if (origin === webAppOrigin) return true;
    return !isTopFrame && ALLOWED_EMBED_ORIGINS.has(origin);
  } catch {
    return false;
  }
}
