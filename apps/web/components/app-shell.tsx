"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppInstallBanner } from "@/components/app-install-banner";
import { AppUpdateGate } from "@/components/app-update-gate";
import { NativeBridgeRuntime } from "@/components/native-bridge-runtime";
import { TemporaryLoginControl } from "@/components/temporary-login-control";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChatProductRoute = pathname === "/chat" || pathname.startsWith("/chat/");

  return (
    <div className={isChatProductRoute ? "app-shell app-shell-chat" : "app-shell"}>
      <NativeBridgeRuntime />
      <AppUpdateGate>
        <AppInstallBanner />
        {isChatProductRoute ? null : (
          <header className="site-header">
            <div>
              <p className="eyebrow">Next.js + Expo WebView</p>
              <strong>Runtime boundary starter</strong>
            </div>

            <nav aria-label="주 내비게이션">
              <Link aria-current={pathname === "/" ? "page" : undefined} href="/">
                홈
              </Link>
              <Link href="/chat">채팅</Link>
            </nav>

            {process.env.NODE_ENV !== "production" ? <TemporaryLoginControl /> : null}
          </header>
        )}

        <main className={isChatProductRoute ? "chat-product-main" : undefined}>{children}</main>
      </AppUpdateGate>
    </div>
  );
}
