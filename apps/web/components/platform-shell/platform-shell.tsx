import type { ReactNode } from "react";
import { PlatformShellVisualViewportBoundary } from "./platform-shell-visual-viewport-boundary";

export type PlatformShellScroll = "self" | "child";

export type PlatformShellProps = Readonly<{
  bottomNavigation?: ReactNode;
  children: ReactNode;
  className?: string;
  contentInert?: boolean;
  contentClassName?: string;
  contentTopAction?: ReactNode;
  header: ReactNode;
  headerSize?: "compact";
  overlay?: ReactNode;
  scroll?: PlatformShellScroll;
  scrollResetKey?: string | number;
}>;

export function PlatformShell(props: PlatformShellProps) {
  return <PlatformShellVisualViewportBoundary {...props} />;
}
