"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAuthSessionData } from "./auth-session-data";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(
    () =>
      observeAuthMessages((message) => {
        clearAuthSessionData();
        router.push((message === "LOGIN" ? "/home" : "/login") as Route);
      }),
    [router],
  );
  return null;
}
