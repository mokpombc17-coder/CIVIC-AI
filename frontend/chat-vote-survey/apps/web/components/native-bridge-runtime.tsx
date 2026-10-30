"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { announceWebReady, subscribeNativeMessages } from "@/lib/native/bridge-client";

export function NativeBridgeRuntime() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribeNativeMessages((message) => {
      if (message.type !== "DEEP_LINK") {
        return;
      }

      const target = new URL(message.payload.url);
      if (target.origin !== window.location.origin) {
        return;
      }

      const route = `${target.pathname}${target.search}${target.hash}` as Route;
      router.push(route);
    });

    announceWebReady();
    return unsubscribe;
  }, [router]);

  return null;
}
