import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalE2ELoginControl, localE2ELoginStatusMessage } from "./local-e2e-login-control";

describe("LocalE2ELoginControl", () => {
  it("홈 header에는 로그인 문구를 표시하고 기존 E2E 접근성 이름을 유지한다", () => {
    const markup = renderToStaticMarkup(<LocalE2ELoginControl />);

    expect(markup).toContain('aria-label="로컬 E2E 로그인 갱신"');
    expect(markup).toContain(">로그인</button>");
    expect(markup).not.toContain(">로컬 E2E 로그인 갱신</button>");
  });

  it("비동기 로그인 결과를 보조 기술에 전달할 상태 문구로 변환한다", () => {
    expect(localE2ELoginStatusMessage("idle")).toBe("");
    expect(localE2ELoginStatusMessage("loading")).toBe("로컬 E2E 로그인 발급 중…");
    expect(localE2ELoginStatusMessage("authenticated")).toBe("로컬 E2E 로그인을 갱신했습니다.");
    expect(localE2ELoginStatusMessage("error")).toContain("실패");
  });
});
