"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ShellPermission, ShellRole } from "@/lib/auth/shell-access";
import { LogoutButton } from "@/components/auth/logout-button";

type AdminShellProps = Readonly<{
  activeRoute?: string;
  children: ReactNode;
  role?: ShellRole;
  permissions?: readonly ShellPermission[];
}>;

const adminNavigation = [
  { type: "link", href: "/admin" as Route, label: "관리 홈", access: "ADMIN" },
  {
    type: "link",
    href: "/admin/users" as Route,
    label: "사용자·권한",
    access: "HIGHEST_ADMIN",
  },
  { type: "link", href: "/admin/rag" as Route, label: "문서 관리", access: "RAG_ADMIN" },
  { type: "chat", label: "채팅 운영", access: "CHAT_ADMIN" },
  { type: "link", href: "/admin/tasks" as Route, label: "과업 관리", access: "VOTE_ADMIN" },
  {
    type: "link",
    href: "/admin/simulations" as Route,
    label: "시뮬레이션",
    access: "SIMULATION_ADMIN",
  },
] as const;

export function AdminShell({
  activeRoute,
  children,
  role = "HIGHEST_ADMIN",
  permissions = [],
}: AdminShellProps) {
  const pathname = usePathname();
  const currentRoute = activeRoute ?? pathname ?? "/admin";
  const navigation = adminNavigation.filter((item) => {
    if (item.access === "ADMIN") return role === "ADMIN" || role === "HIGHEST_ADMIN";
    if (item.access === "HIGHEST_ADMIN") return role === "HIGHEST_ADMIN";
    return permissions.includes(item.access);
  });
  const brandHref =
    navigation.find((item) => item.type === "link")?.href ?? ("/forbidden" as Route);
  return (
    <div className="civic-shell civic-shell-admin" data-wireflow-shell="admin">
      <a className="civic-skip-link" href="#civic-content">
        본문 바로가기
      </a>
      <aside className="civic-admin-sidebar">
        <Link className="civic-admin-brand" href={brandHref}>
          <strong>CIVIC AI</strong>
          <small>ADMIN</small>
        </Link>
        <nav aria-label="관리자 주요 메뉴" className="civic-admin-nav">
          {navigation.map((item) =>
            item.type === "chat" ? (
              <div className="civic-admin-nav-group" key="chat-operations">
                <span className="civic-admin-nav-group-label">{item.label}</span>
                <Link
                  aria-current={isChatRequestActive(currentRoute) ? "page" : undefined}
                  className="civic-admin-nav-link civic-admin-nav-sub-link"
                  href="/admin/chat/requests"
                >
                  <span>토론방 신청 목록</span>
                </Link>
                <Link
                  aria-current={isChatManagementActive(currentRoute) ? "page" : undefined}
                  className="civic-admin-nav-link civic-admin-nav-sub-link"
                  href="/admin/chat"
                >
                  <span>토론방 관리</span>
                </Link>
                <Link
                  aria-current={isChatCategoryActive(currentRoute) ? "page" : undefined}
                  className="civic-admin-nav-link civic-admin-nav-sub-link"
                  href="/admin/chat/categories"
                >
                  <span>카테고리 관리</span>
                </Link>
              </div>
            ) : (
              <Link
                aria-current={isActive(currentRoute, item.href) ? "page" : undefined}
                className="civic-admin-nav-link"
                href={item.href}
                key={item.href}
              >
                <span>{item.label}</span>
              </Link>
            ),
          )}
        </nav>
        <LogoutButton />
      </aside>
      <div className="civic-admin-stage">
        <main className="civic-content civic-admin-content" id="civic-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function isActive(activeRoute: string, href: string): boolean {
  return activeRoute === href || (href !== "/admin" && activeRoute.startsWith(`${href}/`));
}

function isChatRequestActive(activeRoute: string): boolean {
  return activeRoute === "/admin/chat/requests" || activeRoute.startsWith("/admin/chat/requests/");
}

function isChatCategoryActive(activeRoute: string): boolean {
  return (
    activeRoute === "/admin/chat/categories" || activeRoute.startsWith("/admin/chat/categories/")
  );
}

function isChatManagementActive(activeRoute: string): boolean {
  return (
    (activeRoute === "/admin/chat" || activeRoute.startsWith("/admin/chat/")) &&
    !isChatRequestActive(activeRoute) &&
    !isChatCategoryActive(activeRoute)
  );
}
