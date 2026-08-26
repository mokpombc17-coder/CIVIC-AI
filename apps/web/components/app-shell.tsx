import type { ReactNode } from "react";
import { AppInstallBanner } from "@/components/app-install-banner";
import { AppUpdateGate } from "@/components/app-update-gate";
import { NativeBridgeRuntime } from "@/components/native-bridge-runtime";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <NativeBridgeRuntime />
      <AppUpdateGate>
        <AppInstallBanner />
        <div className="app-route-content">{children}</div>
      </AppUpdateGate>
    </div>
  );
}
