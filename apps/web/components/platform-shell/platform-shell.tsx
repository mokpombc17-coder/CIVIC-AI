import type { ReactNode } from "react";
import styles from "./platform-shell.module.css";

export type PlatformShellScroll = "self" | "child";

export type PlatformShellProps = Readonly<{
  bottomNavigation: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  header: ReactNode;
  scroll?: PlatformShellScroll;
}>;

export function PlatformShell({
  bottomNavigation,
  children,
  className,
  contentClassName,
  header,
  scroll = "self",
}: PlatformShellProps) {
  return (
    <div className={styles.stage} data-platform-shell-stage="true">
      <div
        className={joinClassNames(styles.shell, className)}
        data-platform-shell="true"
        data-scroll={scroll}
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
    </div>
  );
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
