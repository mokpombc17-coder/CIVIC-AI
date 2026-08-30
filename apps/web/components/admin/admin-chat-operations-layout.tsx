import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin-chat-operations-layout.module.css";

export type AdminChatSection = "rooms" | "requests" | "categories" | "statistics" | "export";

const navigation: readonly Readonly<{
  href: Route;
  label: string;
  section: AdminChatSection;
}>[] = [
  { href: "/admin/chat" as Route, label: "채팅방", section: "rooms" },
  { href: "/admin/chat/requests" as Route, label: "신청", section: "requests" },
  { href: "/admin/chat/categories" as Route, label: "카테고리", section: "categories" },
  { href: "/admin/chat/statistics" as Route, label: "통계", section: "statistics" },
  { href: "/admin/chat/export" as Route, label: "Export", section: "export" },
];

export function AdminChatOperationsLayout({
  active,
  children,
}: Readonly<{ active: AdminChatSection; children: ReactNode }>) {
  return (
    <div className={styles.layout}>
      <nav aria-label="채팅 운영 메뉴" className={styles.tabs}>
        {navigation.map((item) => (
          <Link
            aria-current={item.section === active ? "page" : undefined}
            href={item.href}
            key={item.section}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
