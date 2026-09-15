import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";
import RefreshPage from "@/app/auth/refresh/page";

describe("authentication transition shells", () => {
  it("does not render the participant mobile shell while the root route is loading", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain('data-fullscreen-status="true"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("aria-busy");
    expect(markup).not.toContain('data-platform-shell="true"');
    expect(markup).not.toContain("civic-platform-participant");
  });

  it.each([
    { activeHref: "/rag", returnTo: "/rag?question=local", title: "AI" },
    { activeHref: "/mypage", returnTo: "/mypage", title: "계정" },
  ])(
    "$returnTo 토큰 갱신 중에는 목적지 participant shell을 유지한다",
    async ({ activeHref, returnTo, title }) => {
      const page = await RefreshPage({ searchParams: Promise.resolve({ returnTo }) });
      const markup = renderToStaticMarkup(page);

      expect(markup).toContain('data-platform-shell="true"');
      expect(markup).toContain('data-participant-surface="true"');
      expect(markup).toContain(`>${title}</h1>`);
      expect(markup).toMatch(
        new RegExp(`aria-current="page"[^>]*href="${activeHref.replace("/", "\\/")}"`),
      );
      expect(markup).not.toContain('data-fullscreen-status="true"');
      expect(markup).not.toContain("로그인 상태를 확인하고 있습니다.");
    },
  );

  it.each(["/account", "/chat", "/vote/results"])(
    "%s 토큰 갱신 중에도 participant shell을 사용한다",
    async (returnTo) => {
      const page = await RefreshPage({ searchParams: Promise.resolve({ returnTo }) });
      const markup = renderToStaticMarkup(page);

      expect(markup).toContain('data-platform-shell="true"');
      expect(markup).toContain('data-participant-surface="true"');
      expect(markup).not.toContain('data-fullscreen-status="true"');
      expect(markup).not.toContain("로그인 상태를 확인하고 있습니다.");
    },
  );

  it("설문 토큰 갱신 중에는 기존 설문 로딩 화면을 유지한다", async () => {
    const page = await RefreshPage({
      searchParams: Promise.resolve({ returnTo: "/survey?returnTo=%2Frag" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('data-participant-surface="true"');
    expect(markup).toContain("설문 확인 중");
    expect(markup).toContain("Vote 서버에서 현재 설문을 불러오는 중입니다…");
    expect(markup).not.toContain('data-fullscreen-status="true"');
    expect(markup).not.toContain("로그인 상태를 확인하고 있습니다.");
  });

  it("does not render the participant mobile shell while an admin token refreshes", async () => {
    const page = await RefreshPage({
      searchParams: Promise.resolve({ returnTo: "/admin/rag" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain('data-fullscreen-status="true"');
    expect(markup).toContain("로그인 상태를 확인하고 있습니다.");
    expect(markup).not.toContain('data-platform-shell="true"');
    expect(markup).not.toContain("civic-platform-participant");
  });
});
