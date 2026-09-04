import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const globalStyles = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
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
});
