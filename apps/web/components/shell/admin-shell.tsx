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
    label: "사용자",
    access: "HIGHEST_ADMIN",
  },
  { type: "link", href: "/admin/tasks" as Route, label: "투표", access: "VOTE_ADMIN" },
  { type: "link", href: "/admin/rag" as Route, label: "문서", access: "RAG_ADMIN" },
  { type: "link", href: "/admin/chat" as Route, label: "토론방", access: "CHAT_ADMIN" },
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
          {navigation.map((item) => (
            <Link
              aria-current={isActive(currentRoute, item.href) ? "page" : undefined}
              className="civic-admin-nav-link"
              href={item.href}
              key={item.href}
            >
              <span>{item.label}</span>
            </Link>
          ))}
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
