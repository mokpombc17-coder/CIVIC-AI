"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NativeBridgeRuntime } from "@/components/native-bridge-runtime";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navigationCounter, setNavigationCounter] = useState(0);

  return (
    <div className="app-shell">
      <NativeBridgeRuntime />
      <header className="site-header">
        <div>
          <p className="eyebrow">Next.js + Expo WebView</p>
          <strong>Runtime boundary starter</strong>
        </div>

        <nav aria-label="주 내비게이션">
          <Link aria-current={pathname === "/" ? "page" : undefined} href="/">
            홈
          </Link>
          <Link
            aria-current={pathname === "/architecture" ? "page" : undefined}
            href="/architecture"
          >
            구조
          </Link>
        </nav>

        <button
          className="secondary-button"
          onClick={() => setNavigationCounter((value) => value + 1)}
          type="button"
        >
          layout state: {navigationCounter}
        </button>
      </header>

      <main>{children}</main>
    </div>
  );
}
