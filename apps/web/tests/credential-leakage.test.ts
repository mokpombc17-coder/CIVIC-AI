import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");

describe("browser credential boundary", () => {
  it("functional screen code never persists credentials in browser storage or caches", async () => {
    const source = await readFile(
      path.join(webRoot, "components/screens/main-functional-screen.tsx"),
      "utf8",
    );
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "caches.open",
      "navigator.serviceWorker",
      "access_token",
      "refresh_token",
      "internal_token",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("BFF forwards only allowlisted HttpOnly cookies and keeps responses private no-store", async () => {
    const source = await readFile(path.join(webRoot, "lib/api/main-auth-client.ts"), "utf8");
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('"private, no-store"');
    expect(source).toContain("PLATFORM_AUTH_COOKIE_NAME");
    expect(source).toContain("PLATFORM_REFRESH_COOKIE_NAME");
    expect(source).toContain("PLATFORM_AUTH_FLOW_COOKIE_NAME");
    expect(source).not.toContain("__Host-civic-session");
    expect(source).not.toContain("/internal/v1/tokens");
    expect(source).not.toContain("localStorage");
    expect(source).toContain('request.headers.get("x-real-ip")');
    expect(source).toContain("isIP(clientAddress)");
    expect(source).not.toContain('request.headers.get("x-forwarded-for")');
    expect(source).not.toContain('headers.set("x-civic-client-ip"');
  });
});
