import type { ReactNode, Ref } from "react";
import styles from "./platform-shell.module.css";

export type PlatformShellScroll = "self" | "child";

export type PlatformShellProps = Readonly<{
  bottomNavigation?: ReactNode;
  children: ReactNode;
  className?: string;
  contentInert?: boolean;
  contentClassName?: string;
  header: ReactNode;
  overlay?: ReactNode;
  scroll?: PlatformShellScroll;
  shellRef?: Ref<HTMLDivElement>;
}>;

export function PlatformShell({
  bottomNavigation,
  children,
  className,
  contentInert = false,
  contentClassName,
  header,
  overlay,
  scroll = "self",
  shellRef,
}: PlatformShellProps) {
  return (
    <div className={styles.stage} data-platform-shell-stage="true">
      <div
        className={joinClassNames(styles.shell, className)}
        data-platform-shell="true"
        data-scroll={scroll}
        ref={shellRef}
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
