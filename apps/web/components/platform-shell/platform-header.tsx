import type { ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformHeaderProps = Readonly<{
  actions?: ReactNode;
  className?: string;
  leading?: ReactNode;
  title: ReactNode;
}>;

export function PlatformHeader({ actions, className, leading, title }: PlatformHeaderProps) {
  return (
    <header className={[styles.header, className].filter(Boolean).join(" ")}>
      <div className={styles.headerRow}>
        {leading ? <div className={styles.headerLeading}>{leading}</div> : null}
        <h1 className={styles.headerTitle}>{title}</h1>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
    </header>
  );
}
