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
const platformPageShellSource = readFileSync(
  path.join(webRoot, "components/platform-page-shell.tsx"),
  "utf8",
);
const visualViewportStageSource = readFileSync(
  path.join(webRoot, "components/platform-shell/platform-visual-viewport-stage.tsx"),
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

  it("scopes visual viewport height to the standalone opt-in stage", () => {
    expect(platformShellStyles).toContain("@media (display-mode: standalone)");
    expect(platformShellStyles).toContain('.stage[data-visual-viewport="true"]');
    expect(platformShellStyles).toContain("height: var(--platform-visual-viewport-height)");
  });

  it("keeps PlatformPageShell server-compatible and isolates viewport effects", () => {
    expect(platformPageShellSource).not.toContain('"use client"');
    expect(visualViewportStageSource.startsWith('"use client"')).toBe(true);
    expect(visualViewportStageSource).toContain("window.visualViewport");
    expect(visualViewportStageSource).not.toContain("window.innerHeight");
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

  it("keeps public auth keyboard handling on the bounded child scroller", () => {
    expect(wireflowStyles).not.toContain("--pwa-keyboard-inset");
    expect(wireflowStyles).not.toContain(".civic-auth-grid:focus-within");
  });

  it("delegates mypage scrolling to the bounded account hub", () => {
    expect(wireflowStyles).toContain(
      ".civic-platform-participant-body:has(> .civic-functional-screen > .wf-account-hub)",
    );
    const accountHubRule = wireflowStyles.match(/^\.wf-account-hub \{(?<body>[^}]*)\}/m)?.groups
      ?.body;
    expect(accountHubRule).toBeDefined();
    expect(accountHubRule).toContain("min-height: 0");
    expect(accountHubRule).toContain("flex: 1 1 auto");
    expect(accountHubRule).toContain("overflow-y: auto");
  });

  it("lets standalone auth and account forms chain vertical gestures at scroll boundaries", () => {
    expect(wireflowStyles).toContain(`@media (display-mode: standalone) {
  .civic-public-auth-content [data-wireflow-screen^="AUTH-"] .civic-auth-grid,
  [data-wireflow-screen^="U-ACCOUNT"] .wf-account-hub {
    overscroll-behavior-y: auto;
    touch-action: pan-y pinch-zoom;
  }
}`);
  });

  it("keeps expanded mypage security forms free from an internal divider", () => {
    const securityFormRule = [
      ...wireflowStyles.matchAll(/^\.wf-security-form \{(?<body>[^}]*)\}/gm),
    ]
      .map((match) => match.groups?.body)
      .find((body) => body?.includes("display: grid"));
    expect(securityFormRule).toBeDefined();
    expect(securityFormRule).not.toContain("border-top");
    expect(securityFormRule).toContain("padding: 0 20px 20px");
  });
});
