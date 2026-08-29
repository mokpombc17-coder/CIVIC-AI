import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Loading from "@/app/loading";
import RefreshPage from "@/app/auth/refresh/page";

describe("route-neutral authentication transitions", () => {
  it("does not render the participant mobile shell while the root route is loading", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain('data-fullscreen-status="true"');
    expect(markup).not.toContain('data-platform-shell="true"');
    expect(markup).not.toContain("civic-platform-participant");
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
