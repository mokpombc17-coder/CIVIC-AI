"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  capturePwaInstallPrompt,
  requestPwaInstall,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";

export function PwaInstallTriggerCard({ children }: Readonly<{ children: ReactNode }>) {
  const installPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [installAvailable, setInstallAvailable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      installPrompt.current = capturePwaInstallPrompt(event);
      setInstallAvailable(true);
    };
    const handleInstalled = () => {
      installPrompt.current = null;
      setInstallAvailable(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = () => {
    const event = installPrompt.current;
    if (!event) return;

    installPrompt.current = null;
    setInstallAvailable(false);
    void requestPwaInstall(event).catch(() => undefined);
  };

  return (
    <section
      className="wf-card wf-home-welcome wf-pwa-install-trigger"
      data-pwa-install-trigger="true"
    >
      {children}
      {installAvailable ? (
        <button
          aria-label="CIVIC.AI 앱 설치"
          className="wf-pwa-install-trigger-button"
          onClick={handleInstall}
          type="button"
        />
      ) : null}
    </section>
  );
}
