import Link from "next/link";
import type { Route } from "next";
import type { MouseEventHandler, ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformHeaderBackAction =
  | Readonly<{
      ariaLabel?: string;
      href: Route;
      onClick?: never;
    }>
  | Readonly<{
      ariaLabel?: string;
      href?: never;
      onClick: MouseEventHandler<HTMLButtonElement>;
    }>;

export type PlatformHeaderProps = Readonly<{
  actions?: ReactNode;
  backAction?: PlatformHeaderBackAction;
  className?: string;
  leading?: ReactNode;
  title: ReactNode;
}>;

export function PlatformHeader({
  actions,
  backAction,
  className,
  leading,
  title,
}: PlatformHeaderProps) {
  const resolvedLeading =
    leading === undefined ? <PlatformHeaderBackControl action={backAction} /> : leading;

  return (
    <header className={[styles.header, className].filter(Boolean).join(" ")}>
      <div className={styles.headerRow}>
        {resolvedLeading ? <div className={styles.headerLeading}>{resolvedLeading}</div> : null}
        <h1 className={styles.headerTitle}>{title}</h1>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
    </header>
  );
}

function PlatformHeaderBackControl({ action }: { action: PlatformHeaderBackAction | undefined }) {
  const ariaLabel = action?.ariaLabel ?? "뒤로 가기";
  const icon = <span aria-hidden="true" className={styles.headerBackIcon} />;

  if (!action) {
    return (
      <button
        aria-label={ariaLabel}
        className={styles.headerBackControl}
        data-state="disabled"
        disabled
        type="button"
      >
        {icon}
      </button>
    );
  }

  if (action.href && isHomeHref(action.href)) {
    return (
      <a
        aria-label={ariaLabel}
        className={styles.headerBackControl}
        data-navigation-mode="document"
        data-state="enabled"
        href={action.href}
      >
        {icon}
      </a>
    );
  }

  if (action.href) {
    return (
      <Link
        aria-label={ariaLabel}
        className={styles.headerBackControl}
        data-navigation-mode="client"
        data-state="enabled"
        href={action.href}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className={styles.headerBackControl}
      data-state="enabled"
      onClick={action.onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function isHomeHref(href: string): boolean {
  return href === "/home" || href.startsWith("/home?") || href.startsWith("/home#");
}
