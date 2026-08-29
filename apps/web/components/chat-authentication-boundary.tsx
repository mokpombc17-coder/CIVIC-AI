"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { CHAT_ERROR_CARD_ACTION_CLASS_NAME, ChatErrorCard } from "@/components/chat-error-card";
import { PlatformPageShell } from "@/components/platform-page-shell";
import {
  CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
  createCurrentChatLoginHref,
  getChatAuthenticationRequiredSnapshot,
  subscribeChatAuthenticationRequired,
} from "@/lib/chat/chat-authentication-required";

type ChatAuthenticationBoundaryViewProps = Readonly<{
  authenticationRequired: boolean;
  children: ReactNode;
  loginHref: string;
}>;

export function ChatAuthenticationBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const authenticationRequired = useSyncExternalStore(
    subscribeChatAuthenticationRequired,
    getChatAuthenticationRequiredSnapshot,
    () => false,
  );

  if (!authenticationRequired) {
    return children;
  }

  return (
    <ChatAuthenticationBoundaryView authenticationRequired loginHref={createCurrentChatLoginHref()}>
      {children}
    </ChatAuthenticationBoundaryView>
  );
}

export function ChatAuthenticationBoundaryView({
  authenticationRequired,
  children,
  loginHref,
}: ChatAuthenticationBoundaryViewProps) {
  if (!authenticationRequired) {
    return children;
  }

  return (
    <PlatformPageShell
      bottomNavigation={null}
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      title="토론방"
    >
      <div className="px-4 py-4" data-chat-authentication-required="true">
        <ChatErrorCard
          action={
            <a className={CHAT_ERROR_CARD_ACTION_CLASS_NAME} href={loginHref}>
              로그인하기
            </a>
          }
          ariaLive="assertive"
          detail={
            <>
              {CHAT_AUTHENTICATION_REQUIRED_MESSAGE}
              <br />
              로그인하면 현재 화면으로 돌아옵니다.
            </>
          }
          title="로그인이 필요합니다."
        />
      </div>
    </PlatformPageShell>
  );
}
