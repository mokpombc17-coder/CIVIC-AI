"use client";

import { useCallback, useState } from "react";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { AuthFunctionalScreen, verificationKindFromSearch } from "./auth-functional-screen";

type PublicAuthHeaderState = Readonly<{
  back: "HISTORY" | string | null;
  title: string;
}>;

export function PublicAuthScreen({
  screen,
  initialSearch = "",
  devQuickLoginEnabled = false,
}: Readonly<{
  screen: ScreenDefinition;
  initialSearch?: string;
  devQuickLoginEnabled?: boolean;
}>) {
  const [activeId, setActiveId] = useState(screen.id);
  const onActiveScreenChange = useCallback((screenId: string) => setActiveId(screenId), []);
  const verificationKind = verificationKindFromSearch(initialSearch);
  const header = publicAuthHeaderState(activeId, verificationKind);
  const backAction =
    header.back === "HISTORY"
      ? {
          ariaLabel: "이전 가입 단계로 돌아가기",
          onClick: () => history.back(),
        }
      : header.back
        ? { ariaLabel: "이전 화면으로 돌아가기", href: header.back }
        : undefined;

  return (
    <PlatformPageShell
      {...(backAction ? { backAction } : {})}
      {...(activeId === "AUTH-001"
        ? { className: "civic-login-shell" }
        : activeId === "AUTH-002"
          ? { className: "civic-signup-account-shell" }
          : {})}
      bottomNavigation={null}
      title={header.title}
    >
      <AuthFunctionalScreen
        devQuickLoginEnabled={devQuickLoginEnabled}
        initialSearch={initialSearch}
        onActiveScreenChange={onActiveScreenChange}
        screen={screen}
      />
    </PlatformPageShell>
  );
}

export function publicAuthHeaderState(
  activeId: string,
  verificationKind: "SIGNUP" | "TWO_FACTOR",
): PublicAuthHeaderState {
  if (activeId === "AUTH-001") return { back: null, title: "로그인" };
  if (activeId === "AUTH-002") return { back: "/login", title: "회원가입" };
  if (activeId === "AUTH-003" || activeId === "AUTH-004") {
    return { back: "HISTORY", title: "회원가입" };
  }
  if (activeId === "AUTH-005") {
    return {
      back: verificationKind === "TWO_FACTOR" ? "/login" : "/signup/pending",
      title: verificationKind === "TWO_FACTOR" ? "2단계 인증" : "이메일 인증",
    };
  }
  if (activeId === "AUTH-006") return { back: "/signup/account", title: "이메일 인증" };
  if (activeId === "AUTH-007") return { back: "/login", title: "비밀번호 재설정" };
  if (activeId === "AUTH-008") {
    return { back: "/password-reset", title: "비밀번호 재설정" };
  }
  if (activeId === "AUTH-009" || activeId === "AUTH-010") {
    return { back: "/login", title: "계정 재활성화" };
  }
  return { back: null, title: "인증" };
}
