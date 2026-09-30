import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getScreenByRoute } from "@/lib/screens/registry";
import { resetAuthScrollTop } from "./auth-functional-screen";
import { PublicAuthScreen, publicAuthHeaderState } from "./public-auth-screen";

describe("PublicAuthScreen", () => {
  it.each(["/login", "/password-reset", "/password-reset/complete"])(
    "%s 화면은 RAG와 동일하게 자식 스크롤을 사용한다",
    (pathname) => {
      const screen = getScreenByRoute(pathname);
      if (!screen) throw new TypeError(`${pathname} screen is missing`);

      const html = renderToStaticMarkup(<PublicAuthScreen screen={screen} />);

      expect(html.match(/data-scroll="child"/gu)).toHaveLength(2);
      expect(html).toContain("civic-public-auth-content");
      expect(html).toContain('data-visual-viewport-sizing="true"');
    },
  );

  it.each([
    ["/login", ["next", "go"]],
    ["/signup/account", ["next", "next", "done"]],
    ["/password-reset", ["done"]],
    ["/password-reset/complete", ["next", "next", "done"]],
  ])("%s 입력 순서에 맞는 모바일 키보드 액션을 제공한다", (pathname, expectedHints) => {
    const screen = getScreenByRoute(pathname);
    if (!screen) throw new TypeError(`${pathname} screen is missing`);

    const html = renderToStaticMarkup(<PublicAuthScreen screen={screen} />);
    const hints = Array.from(html.matchAll(/enterKeyHint="([^"]+)"/gu), (match) => match[1]);

    expect(hints).toEqual(expectedHints);
  });
});

describe("resetAuthScrollTop", () => {
  it("인증 단계가 바뀌면 내부 스크롤을 맨 위로 되돌린다", () => {
    const scroller = { scrollTop: 320 };

    resetAuthScrollTop(scroller);

    expect(scroller.scrollTop).toBe(0);
    expect(() => resetAuthScrollTop(null)).not.toThrow();
  });
});

describe("publicAuthHeaderState", () => {
  it("회원가입 단계마다 왼쪽 상단 뒤로가기를 올바른 대상으로 연결한다", () => {
    expect(publicAuthHeaderState("AUTH-002", "SIGNUP")).toEqual({
      back: "/login",
      title: "회원가입",
    });
    expect(publicAuthHeaderState("AUTH-003", "SIGNUP")).toEqual({
      back: "/signup/account",
      title: "회원가입",
    });
    expect(publicAuthHeaderState("AUTH-004", "SIGNUP")).toEqual({
      back: "HISTORY",
      title: "회원가입",
    });
  });

  it("같은 인증 화면도 가입과 로그인 2차 인증의 제목·복귀 경로를 구분한다", () => {
    expect(publicAuthHeaderState("AUTH-005", "SIGNUP")).toEqual({
      back: "/signup/account",
      title: "이메일 인증",
    });
    expect(publicAuthHeaderState("AUTH-005", "TWO_FACTOR")).toEqual({
      back: "/login",
      title: "로그인 2차 인증",
    });
  });

  it("비밀번호 재설정 코드·변경 화면은 같은 헤더 제목을 사용한다", () => {
    expect(publicAuthHeaderState("AUTH-007", "SIGNUP")).toEqual({
      back: "/login",
      title: "비밀번호 재설정",
    });
    expect(publicAuthHeaderState("AUTH-008", "SIGNUP")).toEqual({
      back: "/password-reset",
      title: "비밀번호 재설정",
    });
  });
});
