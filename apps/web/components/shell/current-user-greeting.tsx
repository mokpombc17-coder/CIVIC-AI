"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

/** 이메일 로컬파트를 표시 이름으로 사용한다 (auth/me 계약에 이름 필드가 없음). */
export function greetingNameFromEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const [local] = email.split("@");
  return local ? local : null;
}

export function CurrentUserGreeting() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/v1/account/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const profile = (await response.json().catch(() => null)) as { email?: unknown } | null;
        if (active) setName(greetingNameFromEmail(profile?.email));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!name) return null;
  return <span className="civic-header-greeting">{name}님</span>;
}
