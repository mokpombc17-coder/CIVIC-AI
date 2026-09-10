import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeBrandTitle, HOME_SERVICE_REGION_LABEL } from "./home-brand-title";
import {
  CurrentUserHeaderIdentity,
  CurrentUserMenuPanel,
  greetingNameFromEmail,
  isAdministratorRole,
} from "./current-user-greeting";

const menuCallbacks = {
  onClose: vi.fn(),
  onInstall: vi.fn(),
  onLogout: vi.fn(),
};

describe("CurrentUserHeaderIdentity", () => {
  it("이메일 로컬파트만 인사말 이름으로 사용한다", () => {
    expect(greetingNameFromEmail("admin@example.com")).toBe("admin");
    expect(greetingNameFromEmail("")).toBeNull();
    expect(greetingNameFromEmail(null)).toBeNull();
  });

  it("사용자 이름을 접근 가능한 팝업 trigger로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <CurrentUserHeaderIdentity isAdministrator={false} name="citizen" />,
    );

    expect(html).toContain('aria-label="citizen님 사용자 메뉴"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("citizen님");
    expect(html).not.toContain("civic-header-page-switch");
  });

  it("관리자 메뉴에 관리자 페이지·앱 설치·로그아웃을 단순 목록으로 제공한다", () => {
    expect(isAdministratorRole("ADMIN")).toBe(true);
    expect(isAdministratorRole("HIGHEST_ADMIN")).toBe(true);
    expect(isAdministratorRole("PARTICIPANT")).toBe(false);

    const html = renderToStaticMarkup(
      <CurrentUserMenuPanel
        installAvailable
        isAdministrator
        logoutBusy={false}
        logoutFailed={false}
        {...menuCallbacks}
      />,
    );

    expect(html).toContain('aria-label="사용자 메뉴"');
    expect(html).toContain('href="/admin"');
    expect(html).toMatch(/관리자 페이지[\s\S]+앱 설치[\s\S]+로그아웃/);
    expect(html).not.toContain('role="separator"');
  });

  it("일반 사용자에게 관리자 페이지를 노출하지 않고 설치 불가 상태를 disabled로 알린다", () => {
    const html = renderToStaticMarkup(
      <CurrentUserMenuPanel
        installAvailable={false}
        isAdministrator={false}
        logoutBusy={false}
        logoutFailed={false}
        {...menuCallbacks}
      />,
    );

    expect(html).not.toContain("관리자 페이지");
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>앱 설치<\/button>/);
    expect(html).toContain("로그아웃");
  });

  it("로그아웃 진행·실패 상태를 팝업 안에서 알린다", () => {
    const html = renderToStaticMarkup(
      <CurrentUserMenuPanel
        installAvailable={false}
        isAdministrator={false}
        logoutBusy
        logoutFailed
        {...menuCallbacks}
      />,
    );

    expect(html).toContain("로그아웃 중…");
    expect(html).toContain("disabled");
    expect(html).toContain('role="status"');
    expect(html).toContain("로그아웃하지 못했습니다.");
  });
});

describe("HomeBrandTitle", () => {
  it("CIVIC.AI 옆에 고정 서비스 권역 뱃지를 렌더링한다", () => {
    const html = renderToStaticMarkup(<HomeBrandTitle />);

    expect(HOME_SERVICE_REGION_LABEL).toBe("전남광주");
    expect(html).toContain('aria-label="CIVIC.AI 전남광주"');
    expect(html).toMatch(/CIVIC\.AI[\s\S]+전남광주/);
    expect(html).toContain("civic-region-badge");
  });
});
