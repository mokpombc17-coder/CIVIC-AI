import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_AUTHENTICATION_REQUIRED,
  downloadFile,
  supportsAuthenticatedNativeDownload,
} from "./download-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supportsAuthenticatedNativeDownload", () => {
  it("requires the explicit authenticated-download capability", () => {
    expect(supportsAuthenticatedNativeDownload(["download"])).toBe(false);
    expect(supportsAuthenticatedNativeDownload(["download", "authenticated-download"])).toBe(true);
  });

  it("refreshes authentication before starting a browser download", async () => {
    const click = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ click, download: "", href: "", rel: "" })),
    });
    const authenticate = vi.fn().mockResolvedValue(true);

    await downloadFile(
      { url: "https://civic.example/api/v1/rag/export", requiresAuthentication: true },
      authenticate,
    );

    expect(authenticate).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("does not start a download when access-token rotation fails", async () => {
    const authenticate = vi.fn().mockResolvedValue(false);

    await expect(
      downloadFile(
        { url: "https://civic.example/api/v1/rag/export", requiresAuthentication: true },
        authenticate,
      ),
    ).rejects.toThrow(DOWNLOAD_AUTHENTICATION_REQUIRED);
  });
});
