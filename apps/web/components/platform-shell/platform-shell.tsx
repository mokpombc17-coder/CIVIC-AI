import type { ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformShellScroll = "self" | "child";

export type PlatformShellProps = Readonly<{
  bottomNavigation?: ReactNode;
  children: ReactNode;
  className?: string;
  contentInert?: boolean;
  contentClassName?: string;
  header: ReactNode;
  headerSize?: "compact";
  overlay?: ReactNode;
  scroll?: PlatformShellScroll;
}>;

export function PlatformShell({
  bottomNavigation,
  children,
  className,
  contentInert = false,
  contentClassName,
  header,
  headerSize,
  overlay,
  scroll = "self",
}: PlatformShellProps) {
  return (
    <div className={styles.stage} data-platform-shell-stage="true">
      <div
        className={joinClassNames(styles.shell, className)}
        data-header-size={headerSize}
        data-platform-shell="true"
        data-scroll={scroll}
      >
        <div
          aria-hidden={contentInert ? true : undefined}
          className={styles.surface}
          data-platform-shell-surface="true"
          inert={contentInert}
        >
          {header}
          <main
            className={joinClassNames(styles.content, contentClassName)}
            data-platform-shell-content="true"
            data-scroll={scroll}
          >
            {children}
          </main>
          {bottomNavigation}
        </div>
        {overlay ? (
          <div className={styles.overlay} data-platform-shell-overlay="true">
            {overlay}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
