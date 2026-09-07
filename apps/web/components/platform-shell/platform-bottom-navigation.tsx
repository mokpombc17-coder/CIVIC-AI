import Link from "next/link";
import type { Route } from "next";
import type { AriaAttributes, ReactNode } from "react";
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

export type PlatformBottomNavigationItemProps = Readonly<{
  "aria-current"?: AriaAttributes["aria-current"];
  className?: string;
  href: string;
  icon: ReactNode;
  label: ReactNode;
  navigationMode?: "client" | "document";
}>;

export function PlatformBottomNavigationItem({
  className,
  href,
  icon,
  label,
  navigationMode = "client",
  ...linkProps
}: PlatformBottomNavigationItemProps) {
  const content = (
    <>
      <span aria-hidden="true" className={styles.bottomNavigationIcon}>
        {icon}
      </span>
      <span className={styles.bottomNavigationLabel}>{label}</span>
    </>
  );
  const classNames = [styles.bottomNavigationItem, className].filter(Boolean).join(" ");

  if (navigationMode === "document") {
    return (
      <a {...linkProps} className={classNames} href={href}>
        {content}
      </a>
    );
  }

  return (
    <Link {...linkProps} className={classNames} href={href as Route}>
      {content}
    </Link>
  );
}
