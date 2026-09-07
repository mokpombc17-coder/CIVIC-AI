import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformBottomNavigationProps = Readonly<{
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}>;

export function PlatformBottomNavigation({
  ariaLabel = "참여자 주요 메뉴",
  children,
  className,
}: PlatformBottomNavigationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={[styles.bottomNavigation, className].filter(Boolean).join(" ")}
    >
      {children}
    </nav>
  );
}

export type PlatformBottomNavigationItemProps = Readonly<
  Omit<ComponentPropsWithoutRef<typeof Link>, "children" | "href"> & {
    href: string;
    icon: ReactNode;
    label: ReactNode;
  }
>;

export function PlatformBottomNavigationItem({
  className,
  href,
  icon,
  label,
  ...anchorProps
}: PlatformBottomNavigationItemProps) {
  return (
    <Link
      {...anchorProps}
      className={[styles.bottomNavigationItem, className].filter(Boolean).join(" ")}
      href={{ pathname: href }}
    >
      <span aria-hidden="true" className={styles.bottomNavigationIcon}>
        {icon}
      </span>
      <span className={styles.bottomNavigationLabel}>{label}</span>
    </Link>
  );
}
