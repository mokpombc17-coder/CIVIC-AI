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
  it("removes viewport minimums from the document wrappers", () => {
    expect(globalStyles).toContain(`@media (display-mode: standalone) {
  body,
  .app-shell,
  .app-route-content {
    min-height: 0;
  }
}`);
  });

  it("lets the stage own the dynamic viewport height", () => {
    expect(platformShellStyles).toContain(`@media (display-mode: standalone) {
  .stage {
    height: 100dvh;
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
