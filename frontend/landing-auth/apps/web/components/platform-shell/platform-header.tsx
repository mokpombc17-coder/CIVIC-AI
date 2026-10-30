import type { MouseEventHandler, ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformHeaderBackAction =
  | Readonly<{
      ariaLabel?: string;
      disabled: true;
      href?: never;
      onClick?: never;
    }>
  | Readonly<{
      ariaLabel?: string;
      disabled?: false;
      href: string;
      onClick?: never;
    }>
  | Readonly<{
      ariaLabel?: string;
      disabled?: false;
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
    leading === undefined ? (
      backAction ? (
        <PlatformHeaderBackControl action={backAction} />
      ) : null
    ) : (
      leading
    );

  return (
    <header className={[styles.header, className].filter(Boolean).join(" ")}>
      <div className={styles.headerRow}>
        {resolvedLeading ? <div className={styles.headerLeading}>{resolvedLeading}</div> : null}
        <h1 className={styles.headerTitle}>{title}</h1>
        {actions ? (
          <div className={styles.headerActions} data-nosnippet="">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function PlatformHeaderBackControl({ action }: { action: PlatformHeaderBackAction | undefined }) {
  if (!action) return null;
  const ariaLabel = action.ariaLabel ?? "뒤로 가기";
  const icon = <span aria-hidden="true" className={styles.headerBackIcon} />;

  if (action.disabled) {
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

  if (action.href) {
    return (
      <a
        aria-label={ariaLabel}
        className={styles.headerBackControl}
        data-state="enabled"
        href={action.href}
      >
        {icon}
      </a>
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
