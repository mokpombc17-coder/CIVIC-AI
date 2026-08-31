"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./admin-chat-operations-layout.module.css";

// 토론방 운영은 사이드바에서 단일 메뉴이고, 토론방·개설 신청·카테고리 전환은
// 워크스페이스 상단의 섹션 탭으로 한 화면 안에서 이루어진다.
const CHAT_SECTIONS = [
  { href: "/admin/chat" as Route, label: "토론방" },
  { href: "/admin/chat/requests" as Route, label: "개설 신청" },
  { href: "/admin/chat/categories" as Route, label: "카테고리" },
] as const;

export function AdminChatOperationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? "/admin/chat";
  return (
    <div className={styles.layout} data-chat-operations-layout="true">
      <nav aria-label="토론방 운영 섹션" className="console-tabs">
        {CHAT_SECTIONS.map((section) => (
          <Link
            aria-current={isSectionActive(pathname, section.href) ? "page" : undefined}
            className="console-tab"
            href={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function isSectionActive(pathname: string, href: string): boolean {
  if (href === "/admin/chat") {
    return (
      pathname.startsWith("/admin/chat") &&
      !pathname.startsWith("/admin/chat/requests") &&
      !pathname.startsWith("/admin/chat/categories")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
