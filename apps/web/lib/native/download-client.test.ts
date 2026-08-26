import { describe, expect, it } from "vitest";
import { supportsAuthenticatedNativeDownload } from "./download-client";

describe("supportsAuthenticatedNativeDownload", () => {
  it("requires the explicit authenticated-download capability", () => {
    expect(supportsAuthenticatedNativeDownload(["download"])).toBe(false);
    expect(supportsAuthenticatedNativeDownload(["download", "authenticated-download"])).toBe(true);
  });
});
