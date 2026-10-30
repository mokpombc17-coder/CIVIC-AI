import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const platformShellStyles = readFileSync(
  new URL("./platform-shell.module.css", import.meta.url),
  "utf8",
);

const GLOBAL_LEGACY_VIEWPORT_FALLBACK = `@supports not (height: 100dvh) {
  html {
    height: -webkit-fill-available;
  }

  body {
    min-height: 100vh;
    min-height: -webkit-fill-available;
  }
}`;

const PLATFORM_SHELL_LEGACY_VIEWPORT_FALLBACK = `@supports not (height: 100dvh) {
  .stage {
    min-height: 100vh;
    min-height: -webkit-fill-available;
  }

  .shell {
    height: 100vh;
    height: -webkit-fill-available;
  }
}`;

describe("PlatformShell viewport sizing", () => {
  it("구형 WebKit에서는 표시 가능한 화면 높이를 사용한다", () => {
    expect(globalStyles).toContain(GLOBAL_LEGACY_VIEWPORT_FALLBACK);
    expect(platformShellStyles).toContain(PLATFORM_SHELL_LEGACY_VIEWPORT_FALLBACK);
  });

  it("standalone PWA 크기 규칙이 구형 WebKit fallback보다 나중에 적용된다", () => {
    expect(globalStyles.indexOf(GLOBAL_LEGACY_VIEWPORT_FALLBACK)).toBeLessThan(
      globalStyles.indexOf("@media (display-mode: standalone)"),
    );
    expect(platformShellStyles.indexOf(PLATFORM_SHELL_LEGACY_VIEWPORT_FALLBACK)).toBeLessThan(
      platformShellStyles.indexOf("@media (display-mode: standalone)"),
    );
  });
});
