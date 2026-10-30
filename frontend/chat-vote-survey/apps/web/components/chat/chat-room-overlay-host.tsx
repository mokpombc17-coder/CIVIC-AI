import type { ReactNode } from "react";

export function ChatRoomOverlayHost({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }

  return <div className="absolute inset-0 z-40">{children}</div>;
}
