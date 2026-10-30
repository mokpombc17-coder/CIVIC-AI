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
  platformRoute?: string;
  prefetch?: boolean;
}>;

export function PlatformBottomNavigationItem({
  className,
  href,
  icon,
  label,
  navigationMode = "client",
  platformRoute,
  prefetch,
  ...linkProps
}: PlatformBottomNavigationItemProps) {
  const content = (
    <>
      <span aria-hidden="true" className={styles.bottomNavigationIcon}>
        {icon}
      </span>
      <span className={styles.bottomNavigationLabel} data-nosnippet="">
        {label}
      </span>
    </>
  );
  const classNames = [styles.bottomNavigationItem, className].filter(Boolean).join(" ");

  if (navigationMode === "document") {
    return (
      <a
        {...linkProps}
        className={classNames}
        data-platform-navigation-route={platformRoute}
        href={href}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      {...linkProps}
      className={classNames}
      data-platform-navigation-route={platformRoute}
      href={href as Route}
      {...(prefetch === undefined ? {} : { prefetch })}
    >
      {content}
    </Link>
  );
}
