import { describe, expect, it, vi } from "vitest";
import { webViewDownloadHeaders } from "./webview-download-headers";

describe("webViewDownloadHeaders", () => {
  it("passes the same-origin WebView access cookie to an authenticated native download", async () => {
    const readCookieHeader = vi.fn(async () => "civic_ai_access_token=header.payload.signature");

    await expect(
      webViewDownloadHeaders({
        url: new URL("https://civic.example/api/v1/rag/conversations/export"),
        webAppOrigin: "https://civic.example",
        readCookieHeader,
      }),
    ).resolves.toEqual({ Cookie: "civic_ai_access_token=header.payload.signature" });
    expect(readCookieHeader).toHaveBeenCalledWith(
      "https://civic.example/api/v1/rag/conversations/export",
      true,
    );
  });

  it("does not forward access cookies to another allowed download origin", async () => {
    const readCookieHeader = vi.fn(async () => "civic_ai_access_token=header.payload.signature");

    await expect(
      webViewDownloadHeaders({
        url: new URL("https://files.example/export.jsonl"),
        webAppOrigin: "https://civic.example",
        readCookieHeader,
      }),
    ).resolves.toBeUndefined();
    expect(readCookieHeader).not.toHaveBeenCalled();
  });

  it("rejects cookie headers containing line breaks", async () => {
    await expect(
      webViewDownloadHeaders({
        url: new URL("https://civic.example/export.jsonl"),
        webAppOrigin: "https://civic.example",
        readCookieHeader: async () => "session=value\r\nx-injected: true",
      }),
    ).rejects.toThrow("cookie header is invalid");
  });
});
