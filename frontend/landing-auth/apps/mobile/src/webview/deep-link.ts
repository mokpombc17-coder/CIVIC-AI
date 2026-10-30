import { NATIVE_SCHEME, WEB_APP_ORIGIN, WEB_APP_URL } from "../config/runtime";

export function normalizeDeepLink(rawUrl: string): string | null {
  try {
    if (rawUrl.startsWith("/")) {
      const target = new URL(rawUrl, `${WEB_APP_URL}/`);
      return target.origin === WEB_APP_ORIGIN ? target.toString() : null;
    }

    const parsed = new URL(rawUrl);

    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin === WEB_APP_ORIGIN ? parsed.toString() : null;
    }

    if (parsed.protocol === `${NATIVE_SCHEME}:`) {
      const pathParts = [parsed.hostname, parsed.pathname.replace(/^\//, "")].filter(Boolean);
      const path = `/${pathParts.join("/")}${parsed.search}${parsed.hash}`;
      return new URL(path, `${WEB_APP_URL}/`).toString();
    }

    return null;
  } catch {
    return null;
  }
}
