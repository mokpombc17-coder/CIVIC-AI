import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..");

describe("home route import boundary", () => {
  it("홈 route가 계정·인증 화면 조립 모듈을 거치지 않는다", () => {
    const page = readFileSync(join(webRoot, "app", "home", "page.tsx"), "utf8");
    const rootLayout = readFileSync(join(webRoot, "app", "layout.tsx"), "utf8");
    const deferredRuntime = readFileSync(
      join(webRoot, "components", "auth", "deferred-home-query-runtime.tsx"),
      "utf8",
    );
    const homeScreen = readFileSync(
      join(webRoot, "components", "screens", "participant-home-screen.tsx"),
      "utf8",
    );
    const participantShell = readFileSync(
      join(webRoot, "components", "shell", "participant-shell.tsx"),
      "utf8",
    );

    expect(page).toContain("@/components/screens/participant-home-screen");
    expect(page).toContain("@/components/auth/deferred-home-query-runtime");
    expect(page).not.toContain("@/components/screens/main-functional-screen");
    expect(page).not.toContain("@/components/auth/participant-eligibility-guard");
    expect(page.match(/prefetch=\{false\}/gu)).toHaveLength(2);
    expect(rootLayout).not.toContain("AppQueryProvider");
    expect(participantShell).not.toMatch(/ParticipantEligibilityGuard|@tanstack\/react-query/u);
    expect(deferredRuntime).toContain('import("./home-query-runtime")');
    expect(deferredRuntime).toContain('addEventListener("animationend"');
    expect(deferredRuntime).toContain("window.setTimeout(queueRuntimeLoad");
    expect(homeScreen).not.toMatch(
      /account-functional-screen|admin-functional-screen|auth-functional-screen|@tanstack\/react-query/u,
    );
    expect(homeScreen.match(/prefetch=\{false\}/gu)).toHaveLength(3);
  });
});
