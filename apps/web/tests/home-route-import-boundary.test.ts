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
    const animationController = readFileSync(
      join(webRoot, "components", "screens", "home-hero-animation-controller.tsx"),
      "utf8",
    );
    const homeScreen = readFileSync(
      join(webRoot, "components", "screens", "participant-home-screen.tsx"),
      "utf8",
    );
    const opinionHero = readFileSync(
      join(webRoot, "components", "screens", "opinion-gathering-hero.tsx"),
      "utf8",
    );
    const participantShell = readFileSync(
      join(webRoot, "components", "shell", "participant-shell.tsx"),
      "utf8",
    );

    expect(page).toContain("@/components/screens/participant-home-screen");
    expect(page).toContain("@/components/auth/deferred-home-query-runtime");
    expect(page).toContain("@/components/screens/home-hero-animation-controller");
    expect(page).not.toContain("@/components/screens/main-functional-screen");
    expect(page).not.toContain("@/components/auth/participant-eligibility-guard");
    expect(page.match(/prefetch=\{false\}/gu)).toHaveLength(2);
    expect(rootLayout).not.toContain("AppQueryProvider");
    expect(participantShell).not.toMatch(/ParticipantEligibilityGuard|@tanstack\/react-query/u);
    expect(deferredRuntime).toContain('import("./home-query-runtime")');
    expect(deferredRuntime).toContain("homeHeroAnimationCompleteEvent");
    expect(deferredRuntime).toContain("window.setTimeout(queueRuntimeLoad");
    expect(animationController).toContain("window.requestAnimationFrame");
    expect(animationController).toContain("requestIdleCallback");
    expect(animationController).toContain('addEventListener("animationend"');
    expect(animationController).toContain("homeHeroAnimationStartMark");
    expect(homeScreen).not.toMatch(
      /account-functional-screen|admin-functional-screen|auth-functional-screen|@tanstack\/react-query/u,
    );
    expect(homeScreen.match(/prefetch=\{false\}/gu)).toHaveLength(3);
    expect(opinionHero).not.toMatch(/["']use client["']/u);
    expect(opinionHero).toContain("useId");
    expect(opinionHero).not.toMatch(/use(?:Effect|State)|window\.|document\./u);
  });

  it("홈 initial CSS에서 participant 전체·admin stylesheet를 제외한다", () => {
    const rootLayout = readFileSync(join(webRoot, "app", "layout.tsx"), "utf8");
    const homeLayout = readFileSync(join(webRoot, "app", "home", "layout.tsx"), "utf8");
    const participantLayout = readFileSync(
      join(webRoot, "app", "(participant)", "layout.tsx"),
      "utf8",
    );
    const adminLayout = readFileSync(
      join(webRoot, "app", "(admin)", "admin", "layout.tsx"),
      "utf8",
    );
    const homeStyles = readFileSync(join(webRoot, "app", "home", "home.css"), "utf8");
    const wireflowStyles = readFileSync(join(webRoot, "app", "wireflow.css"), "utf8");

    expect(rootLayout).not.toMatch(/import "\.\/(?:wireflow-base|wireflow|admin-console)\.css"/u);
    expect(homeLayout).toContain('import "./home.css"');
    expect(participantLayout).toContain('import "..\/wireflow.css"');
    expect(adminLayout).toContain('import "..\/..\/wireflow.css"');
    expect(adminLayout).toContain('import "..\/..\/admin-console.css"');
    expect(homeStyles).toContain('@import "../wireflow-base.css"');
    expect(homeStyles).toContain(".civic-opinion-hero-question");
    expect(homeStyles).toContain(".civic-header-user-trigger");
    expect(homeStyles).toContain(".civic-header-user-menu-item");
    expect(homeStyles).toContain(".wf-participant-home");
    expect(homeStyles).toContain('[data-wireflow-screen="U-HOME-001"] .wf-home-welcome');
    expect(homeStyles).not.toMatch(/^\.wf-home-welcome/gmu);
    expect(wireflowStyles).not.toContain(".civic-opinion-hero-question");
    expect(wireflowStyles).not.toContain(".civic-header-user-trigger");
    expect(wireflowStyles).not.toContain(".civic-header-user-menu-item");
    expect(wireflowStyles).not.toContain(".wf-home-welcome");
  });
});
