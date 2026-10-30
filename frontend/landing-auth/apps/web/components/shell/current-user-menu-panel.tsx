"use client";

import Link from "next/link";

export function CurrentUserMenuPanel({
  id,
  installAvailable,
  installOpensDialog = false,
  isAdministrator,
  logoutBusy,
  logoutFailed,
  onClose,
  onInstall,
  onLogout,
}: Readonly<{
  id?: string;
  installAvailable: boolean;
  installOpensDialog?: boolean;
  isAdministrator: boolean;
  logoutBusy: boolean;
  logoutFailed: boolean;
  onClose: () => void;
  onInstall: () => void;
  onLogout: () => void;
}>) {
  return (
    <div aria-label="사용자 메뉴" className="civic-header-user-menu" id={id} role="group">
      {isAdministrator ? (
        <Link className="civic-header-user-menu-item" href="/admin" onClick={onClose}>
          관리자 페이지
        </Link>
      ) : null}
      {installAvailable ? (
        <button
          aria-haspopup={installOpensDialog ? "dialog" : undefined}
          className="civic-header-user-menu-item"
          onClick={onInstall}
          type="button"
        >
          앱 설치
        </button>
      ) : null}
      <button
        className="civic-header-user-menu-item"
        disabled={logoutBusy}
        onClick={onLogout}
        type="button"
      >
        {logoutBusy ? "로그아웃 중…" : "로그아웃"}
      </button>
      {logoutFailed ? (
        <p className="civic-header-user-menu-error" role="status">
          로그아웃하지 못했습니다.
        </p>
      ) : null}
    </div>
  );
}
