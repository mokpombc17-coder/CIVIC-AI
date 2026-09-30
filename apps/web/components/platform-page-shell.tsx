import type { ReactNode } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
  type PlatformShellScroll,
} from "@/components/platform-shell";

export type PlatformPageShellProps = Readonly<{
  backAction?: PlatformHeaderBackAction;
  bottomNavigation?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerActions?: ReactNode;
  scroll?: PlatformShellScroll;
  title: ReactNode;
  visualViewportSizing?: boolean;
}>;

export function PlatformPageShell({
  backAction,
  bottomNavigation = <PlatformNavigationClient />,
  children,
  className,
  contentClassName,
  headerActions,
  scroll = "self",
  title,
  visualViewportSizing = false,
}: PlatformPageShellProps) {
  return (
    <PlatformShell
      bottomNavigation={bottomNavigation}
      header={
        <PlatformHeader
          title={title}
          {...(backAction ? { backAction } : {})}
          {...(headerActions !== undefined ? { actions: headerActions } : {})}
        />
      }
      scroll={scroll}
      visualViewportSizing={visualViewportSizing}
      {...(className ? { className } : {})}
      {...(contentClassName ? { contentClassName } : {})}
    >
      {children}
    </PlatformShell>
  );
}
