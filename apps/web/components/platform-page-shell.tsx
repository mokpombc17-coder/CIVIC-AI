import type { ReactNode } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
  type PlatformShellProps,
  type PlatformShellScroll,
} from "@/components/platform-shell";

export type PlatformPageShellProps = Readonly<{
  backAction?: PlatformHeaderBackAction;
  bottomNavigation?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerActions?: ReactNode;
  headerSize?: PlatformShellProps["headerSize"];
  scroll?: PlatformShellScroll;
  title: ReactNode;
}>;

export function PlatformPageShell({
  backAction,
  bottomNavigation = <PlatformNavigationClient />,
  children,
  className,
  contentClassName,
  headerActions,
  headerSize,
  scroll = "self",
  title,
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
      {...(className ? { className } : {})}
      {...(contentClassName ? { contentClassName } : {})}
      {...(headerSize ? { headerSize } : {})}
    >
      {children}
    </PlatformShell>
  );
}
