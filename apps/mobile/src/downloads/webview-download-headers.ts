type CookieHeaderReader = (url: string, useWebKit: boolean) => Promise<string>;

export async function webViewDownloadHeaders({
  readCookieHeader,
  url,
  webAppOrigin,
}: Readonly<{
  readCookieHeader: CookieHeaderReader;
  url: URL;
  webAppOrigin: string;
}>): Promise<Record<string, string> | undefined> {
  if (url.origin !== new URL(webAppOrigin).origin) {
    return undefined;
  }

  const cookieHeader = await readCookieHeader(url.toString(), true);
  if (!cookieHeader) {
    return undefined;
  }
  if (/[\r\n]/u.test(cookieHeader)) {
    throw new Error("Native download cookie header is invalid.");
  }
  return { Cookie: cookieHeader };
}
