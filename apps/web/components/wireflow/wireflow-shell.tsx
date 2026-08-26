import type { ReactNode } from "react";

export function WireflowProductSurface({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="wf-product-surface">{children}</div>;
}
