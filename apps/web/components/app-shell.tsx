import type { ReactNode } from "react";
import { AppUpdateGate } from "@/components/app-update-gate";
import { GoogleAnalyticsUserIdentity } from "@/components/google-analytics-user-identity";
import { NativeBridgeRuntime } from "@/components/native-bridge-runtime";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      {process.env.NODE_ENV === "production" ? <GoogleAnalyticsUserIdentity /> : null}
      <NativeBridgeRuntime />
      <AppUpdateGate>
        <div className="app-route-content">{children}</div>
      </AppUpdateGate>
    </div>
  );
}
