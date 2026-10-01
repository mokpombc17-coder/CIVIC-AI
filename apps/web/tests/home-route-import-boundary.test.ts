import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..");

describe("home route import boundary", () => {
  it("루트 fallback 없이 home과 비동기 특수 route가 각 loading 경계를 소유한다", () => {
    expect(existsSync(join(webRoot, "app", "loading.tsx"))).toBe(false);
    expect(existsSync(join(webRoot, "app", "home", "loading.tsx"))).toBe(true);
    expect(existsSync(join(webRoot, "app", "forbidden", "loading.tsx"))).toBe(true);
  });

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
    const animationBootstrap = readFileSync(
      join(webRoot, "components", "screens", "home-hero-animation-bootstrap.tsx"),
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
    const currentUserGreeting = readFileSync(
      join(webRoot, "components", "shell", "current-user-greeting.tsx"),
      "utf8",
    );

    expect(page).toContain("@/components/screens/participant-home-screen");
    expect(page).toContain("@/components/auth/deferred-home-query-runtime");
    expect(page).toContain("@/components/screens/home-hero-animation-bootstrap");
    expect(page).toContain("@/components/screens/home-hero-animation-controller");
    expect(page.indexOf("<ParticipantHomeScreen")).toBeLessThan(
      page.indexOf("<HomeHeroAnimationBootstrap"),
    );
    expect(page).not.toContain("@/components/screens/main-functional-screen");
    expect(page).not.toContain("@/components/auth/participant-eligibility-guard");
    expect(page.match(/prefetch=\{false\}/gu)).toHaveLength(2);
    expect(rootLayout).not.toContain("AppQueryProvider");
    expect(participantShell).not.toMatch(/ParticipantEligibilityGuard|@tanstack\/react-query/u);
    expect(participantShell).toContain(
      "@/components/shell/participant-swipe-navigation-controller",
    );
    expect(participantShell).not.toContain("deferred-participant-swipe-navigation");
    expect(currentUserGreeting).toContain('import("./current-user-menu-panel")');
    expect(currentUserGreeting).toContain('import("@/components/pwa/pwa-install-guide-dialog")');
    expect(currentUserGreeting).toContain('await import("@/components/auth/logout-button")');
    expect(currentUserGreeting).not.toContain(
      'import { PwaInstallGuideDialog } from "@/components/pwa/pwa-install-guide-dialog"',
    );
    expect(currentUserGreeting).not.toContain(
      'import { requestLogout } from "@/components/auth/logout-button"',
    );
    expect(deferredRuntime).toContain('import("./home-query-runtime")');
    expect(deferredRuntime).toContain("homeHeroAnimationCompleteEvent");
    expect(deferredRuntime).toContain("window.setTimeout(queueRuntimeLoad");
    expect(animationBootstrap).not.toContain('"use client"');
    expect(animationBootstrap).toContain('headers()).get("x-nonce")');
    expect(animationBootstrap).toContain("dangerouslySetInnerHTML");
    expect(animationBootstrap).toContain("homeHeroAnimationBootstrapReadyMark");
    expect(animationBootstrap).toContain('initialState === "pending"');
    expect(animationBootstrap).toContain('addEventListener("animationend"');
    expect(animationBootstrap).toContain("if (!hero.isConnected) return;");
    expect(animationBootstrap).toContain('hero.dataset.homeHeroAnimationFallback = "true"');
    expect(animationBootstrap).toContain("window.setTimeout(forceFallback");
    expect(animationBootstrap).toContain("window.requestAnimationFrame");
    expect(animationController).not.toContain("participantSwipeReadyEvent");
    expect(animationController).not.toContain("participantSwipeReady");
    expect(animationController).toContain("window.requestAnimationFrame");
    expect(animationController).not.toContain("requestIdleCallback");
    expect(animationController).toContain('addEventListener("animationend"');
    expect(animationController).toContain('hero.dataset.homeHeroAnimationFallback = "true"');
    expect(animationController).toContain("window.setTimeout(forceFallback");
    expect(animationController).toContain("homeHeroAnimationStartMark");
    expect(animationController).toContain('initialState === "pending"');
    expect(animationController).toContain("homeHeroTopicRotationMs");
    expect(animationController).toContain("homeHeroTopicTransitionMs");
    expect(animationController).toContain("window.setTimeout(rotateTopic");
    expect(animationController).toContain("currentTopic.hidden = true");
    expect(animationController).toContain("replayHomeHeroAnimation(nextHero)");
    expect(homeScreen).not.toMatch(
      /account-functional-screen|admin-functional-screen|auth-functional-screen|@tanstack\/react-query/u,
    );
    expect(homeScreen.match(/prefetch=\{false\}/gu)).toHaveLength(3);
    expect(opinionHero).not.toMatch(/["']use client["']/u);
    expect(opinionHero).toContain("useId");
    expect(opinionHero).toContain("--civic-hero-dash-length");
    expect(opinionHero).not.toContain("pathLength={1}");
    expect(opinionHero).not.toMatch(/use(?:Effect|State)|window\.|document\./u);
    expect(opinionHero).toContain("suppressHydrationWarning");
  });

  it("전역 auth session sync가 React Query와 RAG runtime을 static import하지 않는다", () => {
    const authSessionData = readFileSync(
      join(webRoot, "components", "auth", "auth-session-data.ts"),
      "utf8",
    );
    const queryCacheControl = readFileSync(
      join(webRoot, "components", "providers", "query-cache-control.ts"),
      "utf8",
    );
    const ragStorage = readFileSync(
      join(webRoot, "components", "rag", "rag-conversation-storage.ts"),
      "utf8",
    );

    expect(authSessionData).toContain("@/components/providers/query-cache-control");
    expect(authSessionData).toContain("@/components/rag/rag-conversation-storage");
    expect(authSessionData).not.toMatch(
      /app-query-provider|rag-conversation-session|@tanstack\/react-query/u,
    );
    expect(queryCacheControl).not.toContain("@tanstack/react-query");
    expect(ragStorage).not.toContain("rag-conversation-session");
  });

  it("Pretendard GOV는 font-face를 유지하되 root layout에서 preload하지 않는다", () => {
    const rootLayout = readFileSync(join(webRoot, "app", "layout.tsx"), "utf8");
    const wireflowCore = readFileSync(join(webRoot, "app", "wireflow-core.css"), "utf8");

    expect(rootLayout).not.toContain('rel="preload"');
    expect(rootLayout).not.toContain("PretendardGOV-");
    expect(wireflowCore.match(/font-family: "Pretendard GOV"/gu)).toHaveLength(3);
    expect(wireflowCore.match(/font-display: swap/gu)).toHaveLength(3);
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
    const forbiddenPage = readFileSync(join(webRoot, "app", "forbidden", "page.tsx"), "utf8");
    const homeStyles = readFileSync(join(webRoot, "app", "home", "home.css"), "utf8");
    const wireflowStyles = readFileSync(join(webRoot, "app", "wireflow.css"), "utf8");

    expect(rootLayout).not.toMatch(
      /import "\.\/(?:wireflow-base|wireflow|admin-shell|admin-base|admin-console)\.css"/u,
    );
    expect(homeLayout).toContain('import "./home.css"');
    expect(participantLayout).toContain('import "..\/wireflow.css"');
    expect(adminLayout).toContain('import "..\/..\/admin-shell.css"');
    expect(adminLayout).toContain('import "..\/..\/admin-base.css"');
    expect(adminLayout).toContain('import "..\/..\/wireflow.css"');
    expect(adminLayout).toContain('import "..\/..\/admin-console.css"');
    expect(forbiddenPage).toContain('import "..\/admin-shell.css"');
    expect(homeStyles).toContain('@import "../wireflow-core.css"');
    expect(homeStyles).not.toContain("wireflow-base.css");
    expect(homeStyles).toContain(".civic-opinion-hero-question");
    expect(homeStyles).toContain(".civic-opinion-hero-chart");
    expect(homeStyles).toContain(".civic-opinion-hero-labels");
    expect(homeStyles).toContain(".civic-home-hero-topic[hidden]");
    expect(homeStyles).toContain('.civic-home-hero-topic[data-home-hero-topic-active="true"]');
    expect(homeStyles).toContain("transition: opacity 240ms ease-out");
    expect(homeStyles).toContain('data-home-hero-animation-fallback="true"');
    expect(homeStyles).toContain("var(--civic-hero-dash-length)");
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
