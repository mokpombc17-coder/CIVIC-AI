"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

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
  if (!name) return null;

  return (
    <div className="civic-header-identity">
      {isAdministrator ? <AdministratorPageSwitch /> : null}
      <span className="civic-header-greeting">{name}님</span>
    </div>
  );
}

function AdministratorPageSwitch() {
  return (
    <nav aria-label="페이지 전환" className="civic-header-page-switch">
      <HeaderPageLink href="/admin" label="관리자 페이지로 이동">
        관리자
      </HeaderPageLink>
      <HeaderPageLink current href="/home" label="사용자 페이지로 이동">
        사용자
      </HeaderPageLink>
    </nav>
  );
}

function HeaderPageLink({
  children,
  current = false,
  href,
  label,
}: Readonly<{
  children: string;
  current?: boolean;
  href: Route;
  label: string;
}>) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      aria-label={label}
      className="civic-header-page-link"
      href={href}
    >
      {children}
    </Link>
  );
}
