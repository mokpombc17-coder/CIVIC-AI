import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getScreenByRoute } from "@/lib/screens/registry";
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
    },
  );
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
