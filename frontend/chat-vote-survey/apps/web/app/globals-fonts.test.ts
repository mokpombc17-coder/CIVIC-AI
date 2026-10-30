import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("global font assets", () => {
  it("공용 Service Worker allowlist와 동일한 origin 폰트 URL을 사용한다", () => {
    const fontUrls = [...globalsCss.matchAll(/src:\s*url\("([^"]+)"\)/g)].map(([, url]) => url);

    expect(globalsCss).not.toContain("cdn.jsdelivr.net");
    expect(fontUrls).toEqual([
      "/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2?v=21c9e3b875c6",
      "/fonts/pretendard-gov/PretendardGOV-Medium.subset.woff2?v=6a3b52d655e7",
      "/fonts/pretendard-gov/PretendardGOV-Bold.subset.woff2?v=d09a0a9684b5",
    ]);
    expect(globalsCss.match(/font-display:\s*swap/g)).toHaveLength(3);
  });
});
