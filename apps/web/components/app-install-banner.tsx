"use client";

import { useEffect, useState } from "react";
import { isNativeShell } from "@/lib/native/bridge-client";

type MobileConfig = {
  store: {
    ios: string | null;
    android: string | null;
  };
};

export function AppInstallBanner() {
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isNativeShell()) {
      return;
    }

    const platform = detectMobilePlatform();
    if (!platform) {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/mobile/config", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as MobileConfig;
      })
      .then((config) => setStoreUrl(config.store[platform]))
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  if (!storeUrl) {
    return null;
  }

  return (
    <aside className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
      <p className="text-sm">앱에서 더 안정적인 모바일 경험을 사용할 수 있습니다.</p>
      <a
        className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        href={storeUrl}
        rel="noreferrer"
      >
        앱 설치
      </a>
    </aside>
  );
}

function detectMobilePlatform(): "ios" | "android" | null {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android/.test(userAgent)) {
    return "android";
  }
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return "ios";
  }
  return null;
}
