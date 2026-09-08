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

type PlatformBottomNavigationItemContentProps = Readonly<{
  href: string;
  icon: ReactNode;
  label: ReactNode;
}>;

export type PlatformBottomNavigationItemProps = Readonly<
  | (Omit<ComponentPropsWithoutRef<typeof Link>, "children" | "href"> &
      PlatformBottomNavigationItemContentProps & {
        navigationMode: "client";
      })
  | (Omit<ComponentPropsWithoutRef<"a">, "children" | "href"> &
      PlatformBottomNavigationItemContentProps & {
        navigationMode: "document";
      })
>;

export function PlatformBottomNavigationItem(props: PlatformBottomNavigationItemProps) {
  if (props.navigationMode === "document") {
    const { className, href, icon, label, navigationMode, ...anchorProps } = props;

    return (
      <a
        {...anchorProps}
        className={[styles.bottomNavigationItem, className].filter(Boolean).join(" ")}
        data-navigation-mode={navigationMode}
        href={href}
      >
        <PlatformBottomNavigationItemContent icon={icon} label={label} />
      </a>
    );
  }

  const { className, href, icon, label, navigationMode, ...linkProps } = props;

  return (
    <Link
      {...linkProps}
      className={[styles.bottomNavigationItem, className].filter(Boolean).join(" ")}
      data-navigation-mode={navigationMode}
      href={{ pathname: href }}
    >
      <PlatformBottomNavigationItemContent icon={icon} label={label} />
    </Link>
  );
}

function PlatformBottomNavigationItemContent({
  icon,
  label,
}: {
  icon: ReactNode;
  label: ReactNode;
}) {
  return (
    <>
      <span aria-hidden="true" className={styles.bottomNavigationIcon}>
        {icon}
      </span>
      <span className={styles.bottomNavigationLabel}>{label}</span>
    </>
  );
}
