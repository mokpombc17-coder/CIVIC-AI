"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { requestLogout } from "@/components/auth/logout-button";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  capturePwaInstallPrompt,
  requestPwaInstall,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";

const USER_MENU_ID = "civic-home-user-menu";

/** 이메일 로컬파트를 표시 이름으로 사용한다 (auth/me 계약에 이름 필드가 없음). */
export function greetingNameFromEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const [local] = email.split("@");
  return local ? local : null;
}

export function isAdministratorRole(role: unknown): boolean {
  return role === "ADMIN" || role === "HIGHEST_ADMIN";
}

export function CurrentUserGreeting() {
  const [name, setName] = useState<string | null>(null);
  const [isAdministrator, setIsAdministrator] = useState(false);

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/v1/account/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const profile = (await response.json().catch(() => null)) as { email?: unknown } | null;
        if (active) setName(greetingNameFromEmail(profile?.email));
      })
      .catch(() => {});

    authenticatedFetch("/api/v1/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const currentUser = (await response.json().catch(() => null)) as { role?: unknown } | null;
        if (active) setIsAdministrator(isAdministratorRole(currentUser?.role));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return <CurrentUserHeaderIdentity isAdministrator={isAdministrator} name={name} />;
}

export function CurrentUserHeaderIdentity({
  isAdministrator,
  name,
}: Readonly<{ isAdministrator: boolean; name: string | null }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const installPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      installPrompt.current = capturePwaInstallPrompt(event);
      setInstallAvailable(true);
    };
    const handleInstalled = () => {
      installPrompt.current = null;
      setInstallAvailable(false);
      setMenuOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (!name) return null;

  const install = () => {
    const event = installPrompt.current;
    if (!event) return;

    installPrompt.current = null;
    setInstallAvailable(false);
    setMenuOpen(false);
    void requestPwaInstall(event).catch(() => undefined);
  };

  const logout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutFailed(false);

    if (await requestLogout()) {
      window.location.replace("/home");
      return;
    }

    setLogoutBusy(false);
    setLogoutFailed(true);
  };

  return (
    <div className="civic-header-identity" ref={containerRef}>
      <button
        aria-controls={USER_MENU_ID}
        aria-expanded={menuOpen}
        aria-label={`${name}님 사용자 메뉴`}
        className="civic-header-user-trigger"
        onClick={() => setMenuOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <span className="civic-header-greeting">{name}님</span>
        <svg
          aria-hidden="true"
          className="civic-header-user-chevron"
          data-open={menuOpen ? "true" : "false"}
          fill="none"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      </button>

      {menuOpen ? (
        <CurrentUserMenuPanel
          installAvailable={installAvailable}
          isAdministrator={isAdministrator}
          logoutBusy={logoutBusy}
          logoutFailed={logoutFailed}
          onClose={() => setMenuOpen(false)}
          onInstall={install}
          onLogout={() => void logout()}
        />
      ) : null}
    </div>
  );
}

export function CurrentUserMenuPanel({
  installAvailable,
  isAdministrator,
  logoutBusy,
  logoutFailed,
  onClose,
  onInstall,
  onLogout,
}: Readonly<{
  installAvailable: boolean;
  isAdministrator: boolean;
  logoutBusy: boolean;
  logoutFailed: boolean;
  onClose: () => void;
  onInstall: () => void;
  onLogout: () => void;
}>) {
  return (
    <div aria-label="사용자 메뉴" className="civic-header-user-menu" id={USER_MENU_ID} role="group">
      {isAdministrator ? (
        <Link className="civic-header-user-menu-item" href="/admin" onClick={onClose}>
          관리자 페이지
        </Link>
      ) : null}
      <button
        className="civic-header-user-menu-item"
        disabled={!installAvailable}
        onClick={onInstall}
        type="button"
      >
        앱 설치
      </button>
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
