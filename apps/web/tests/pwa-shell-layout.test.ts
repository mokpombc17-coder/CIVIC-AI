import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const globalStyles = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
const wireflowStyles = readFileSync(path.join(webRoot, "app/wireflow.css"), "utf8");
const platformShellStyles = readFileSync(
  path.join(webRoot, "components/platform-shell/platform-shell.module.css"),
  "utf8",
);

describe("standalone PWA shell sizing", () => {
  it("anchors the document wrapper height chain without viewport minimums", () => {
    expect(globalStyles).toContain(`@media (display-mode: standalone) {
  html,
  body,
  .app-shell,
  .app-route-content {
    height: 100%;
    min-height: 0;
  }
}`);
  });

  it("lets the stage and shell fill their parent height", () => {
    expect(platformShellStyles).toContain(`@media (display-mode: standalone) {
  .stage {
    height: 100%;
    min-height: 0;
  }

  .shell {
    height: 100%;
  }
}`);
  });

  it("keeps standalone sizing free from the legacy viewport unit", () => {
    expect(globalStyles).not.toContain("min-height: 100vh");
    expect(platformShellStyles).not.toContain("height: 100vh");
  });

  it("gives public auth forms a bounded child scroller with bottom safe area", () => {
    expect(wireflowStyles).toContain(
      '.civic-public-auth-content > [data-wireflow-screen^="AUTH-"].civic-public-screen',
    );
    expect(wireflowStyles).toContain(
      '.civic-public-auth-content [data-wireflow-screen^="AUTH-"] .civic-auth-grid',
    );
    expect(wireflowStyles).toContain("overflow-y: auto");
    expect(wireflowStyles).toContain(
      "padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))",
    );
  });

  it("adds standalone keyboard scroll space while an auth field is focused", () => {
    expect(wireflowStyles).toContain("@media (display-mode: standalone)");
    expect(wireflowStyles).toContain(".civic-auth-grid:focus-within");
    expect(wireflowStyles).toContain(
      "padding-bottom: calc(45vh + env(safe-area-inset-bottom, 0px))",
    );
    expect(wireflowStyles).toContain(
      "scroll-padding-block: 16px calc(45vh + env(safe-area-inset-bottom, 0px))",
    );
  });

  it("adds standalone keyboard scroll space outside the mypage security card", () => {
    expect(wireflowStyles).toContain(
      '[data-wireflow-screen^="U-ACCOUNT-"] .wf-account-hub:has(.wf-security-form input:focus)',
    );
    expect(wireflowStyles).toContain(
      "padding-bottom: calc(45vh + env(safe-area-inset-bottom, 0px))",
    );
  });
});
