"use client";

import type { NativeContext } from "@repo/bridge";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  isNativeShell,
  requestNativeContext,
  requestNativeResponse,
  subscribeNativeMessages,
} from "@/lib/native/bridge-client";
import {
  getRequiredMobileUpdate,
  type MobileConfig,
  type RequiredMobileUpdate,
} from "@/lib/mobile/mobile-config";

export function AppUpdateGate({ children }: { children: ReactNode }) {
  const nativeContextRef = useRef<NativeContext | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [requiredUpdate, setRequiredUpdate] = useState<RequiredMobileUpdate | null>(null);

  const checkForUpdate = useCallback(async (nativeContext: NativeContext) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch("/api/mobile/config", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const config = (await response.json()) as MobileConfig;
      setRequiredUpdate(getRequiredMobileUpdate(nativeContext, config));
    } catch {
      // Keep the last known decision. An initial config failure fails open.
    }
  }, []);

  const refreshNativeContext = useCallback(async () => {
    try {
      const message = await requestNativeResponse(requestNativeContext, ["NATIVE_CONTEXT"], 10_000);
      if (message.type !== "NATIVE_CONTEXT") {
        return;
      }

      nativeContextRef.current = message.payload;
      await checkForUpdate(message.payload);
    } catch {
      // The browser and an unavailable native bridge both fail open.
    }
  }, [checkForUpdate]);

  useEffect(() => {
    if (!isNativeShell()) {
      return;
    }

    const unsubscribe = subscribeNativeMessages((message) => {
      if (message.type !== "APP_STATE_CHANGED" || message.payload.state !== "active") {
        return;
      }

      if (nativeContextRef.current) {
        void checkForUpdate(nativeContextRef.current);
      } else {
        void refreshNativeContext();
      }
    });

    const initialCheckId = window.setTimeout(() => {
      void refreshNativeContext();
    }, 0);

    return () => {
      window.clearTimeout(initialCheckId);
      requestControllerRef.current?.abort();
      unsubscribe();
    };
  }, [checkForUpdate, refreshNativeContext]);

  if (!requiredUpdate) {
    return children;
  }

  return (
    <section
      aria-labelledby="app-update-title"
      className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12 text-slate-950"
      role="alert"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-blue-700">새 버전이 준비되었습니다</p>
        <h1 className="mt-2 text-2xl font-bold" id="app-update-title">
          앱 업데이트가 필요합니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          새로운 모바일 기능을 안전하게 사용하려면 최신 버전으로 업데이트해 주세요.
        </p>
        <a
          className="mt-6 block rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white"
          href={requiredUpdate.storeUrl}
          rel="noreferrer"
        >
          업데이트
        </a>
        <button
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
          onClick={() => {
            const nativeContext = nativeContextRef.current;
            if (nativeContext) {
              void checkForUpdate(nativeContext);
            } else {
              void refreshNativeContext();
            }
          }}
          type="button"
        >
          다시 확인
        </button>
        <p className="mt-4 text-xs text-slate-500">
          현재 빌드 {requiredUpdate.currentBuildVersion} · 최소 빌드{" "}
          {requiredUpdate.minimumBuildVersion}
        </p>
      </div>
    </section>
  );
}
