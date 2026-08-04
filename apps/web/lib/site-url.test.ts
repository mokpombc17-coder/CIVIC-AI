import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site-url";

describe("resolveSiteUrl", () => {
  it("설정되지 않은 SITE_URL은 SEO 절대 URL을 생성하지 않는다", () => {
    expect(resolveSiteUrl(undefined)).toBeNull();
    expect(resolveSiteUrl("   ")).toBeNull();
  });

  it("운영 URL은 origin 루트로 정규화한다", () => {
    expect(resolveSiteUrl("https://civic.example/path?source=test#section")?.href).toBe(
      "https://civic.example/",
    );
  });

  it("HTTP 외의 URL scheme은 거부한다", () => {
    expect(() => resolveSiteUrl("file:///tmp/civic-ai")).toThrow(TypeError);
  });
});
