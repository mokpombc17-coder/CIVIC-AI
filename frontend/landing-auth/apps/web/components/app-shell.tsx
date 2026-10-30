"use client";

import type { ReactNode } from "react";
import { AppUpdateGate } from "@/components/app-update-gate";
import { NativeBridgeRuntime } from "@/components/native-bridge-runtime";
import { PwaServiceWorkerRegistration } from "@/components/pwa/pwa-service-worker-registration";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PwaServiceWorkerRegistration />
      <NativeBridgeRuntime />
      <AppUpdateGate>{children}</AppUpdateGate>
    </>
  );
}
