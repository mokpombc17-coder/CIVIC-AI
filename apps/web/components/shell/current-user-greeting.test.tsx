import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CurrentUserHeaderIdentity,
  greetingNameFromEmail,
  isAdministratorRole,
} from "./current-user-greeting";

describe("CurrentUserHeaderIdentity", () => {
  it("이메일 로컬파트만 인사말 이름으로 사용한다", () => {
    expect(greetingNameFromEmail("admin@example.com")).toBe("admin");
    expect(greetingNameFromEmail("")).toBeNull();
    expect(greetingNameFromEmail(null)).toBeNull();
  });

  it("관리자 역할만 페이지 전환 링크를 이름 왼쪽에 렌더링한다", () => {
    expect(isAdministratorRole("ADMIN")).toBe(true);
    expect(isAdministratorRole("HIGHEST_ADMIN")).toBe(true);
    expect(isAdministratorRole("PARTICIPANT")).toBe(false);

    const html = renderToStaticMarkup(<CurrentUserHeaderIdentity isAdministrator name="admin" />);

    expect(html).toContain('aria-label="페이지 전환"');
    expect(html).toContain('aria-label="관리자 페이지로 이동"');
    expect(html).toContain('href="/admin"');
    expect(html).toContain('aria-label="사용자 페이지로 이동"');
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/civic-header-page-switch[\s\S]+civic-header-greeting/);
  });

  it("일반 사용자는 기존 인사말만 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <CurrentUserHeaderIdentity isAdministrator={false} name="citizen" />,
    );

    expect(html).toContain("citizen님");
    expect(html).not.toContain("civic-header-page-switch");
  });
});
