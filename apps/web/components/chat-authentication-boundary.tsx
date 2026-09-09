"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { recoverAccessToken } from "@/lib/auth/authenticated-fetch";
import { CHAT_ERROR_CARD_ACTION_CLASS_NAME, ChatErrorCard } from "@/components/chat-error-card";
import { ChatRoomLoadingSpinner } from "@/components/chat-room-loading-spinner";
import { PlatformPageShell } from "@/components/platform-page-shell";
import {
  CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
  clearChatAuthenticationRequired,
  createCurrentChatLoginHref,
  getChatAuthenticationRequiredSnapshot,
  subscribeChatAuthenticationRequired,
} from "@/lib/chat/chat-authentication-required";
import {
  attachChatAuthenticationSessionRecovery,
  type ChatAuthenticationSessionRecovery,
  type ChatAuthenticationSessionRecoveryStatus,
} from "@/lib/chat/chat-authentication-session-recovery";
import { CHAT_API_BASE_URL } from "@/lib/chat/chat-config";

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
  const [recoveryStatus, setRecoveryStatus] =
    useState<ChatAuthenticationSessionRecoveryStatus>("checking");
  const recoveryRef = useRef<ChatAuthenticationSessionRecovery | null>(null);

  useEffect(() => {
    if (!authenticationRequired) {
      recoveryRef.current?.dispose();
      recoveryRef.current = null;
      return;
    }

    const recovery = attachChatAuthenticationSessionRecovery({
      onRecovered: clearChatAuthenticationRequired,
      onStatusChange: setRecoveryStatus,
      pageTarget: window,
      recoverAccessToken: () => recoverAccessToken(CHAT_API_BASE_URL),
      visibilityTarget: document,
    });
    recoveryRef.current = recovery;

    return () => {
      recovery.dispose();
      if (recoveryRef.current === recovery) {
        recoveryRef.current = null;
      }
    };
  }, [authenticationRequired]);

  if (!authenticationRequired) {
    return children;
  }

  if (recoveryStatus !== "authentication-required") {
    return (
      <ChatAuthenticationRecoveryView
        onRetry={() => recoveryRef.current?.retry()}
        status={recoveryStatus}
      />
    );
  }

  return (
    <ChatAuthenticationBoundaryView authenticationRequired loginHref={createCurrentChatLoginHref()}>
      {children}
    </ChatAuthenticationBoundaryView>
  );
}

export function ChatAuthenticationRecoveryView({
  onRetry,
  status,
}: Readonly<{
  onRetry: () => void;
  status: Exclude<ChatAuthenticationSessionRecoveryStatus, "authentication-required">;
}>) {
  return (
    <PlatformPageShell
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      headerSize="compact"
      title="토론방"
    >
      {status === "checking" ? (
        <div
          aria-busy="true"
          className="flex min-h-[204px] items-center justify-center"
          data-chat-authentication-recovery="checking"
          role="status"
        >
          <span className="sr-only">채팅 연결을 확인하고 있어요.</span>
          <ChatRoomLoadingSpinner />
        </div>
      ) : (
        <div className="px-4 py-4" data-chat-authentication-recovery="unavailable">
          <ChatErrorCard
            action={
              <button className={CHAT_ERROR_CARD_ACTION_CLASS_NAME} onClick={onRetry} type="button">
                다시 시도
              </button>
            }
            detail="네트워크 연결이 안정되면 자동으로 다시 확인합니다."
            title="채팅 연결을 확인하지 못했습니다."
          />
        </div>
      )}
    </PlatformPageShell>
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
      className="chat-publishing-surface text-[var(--chat-publishing-color-text)]"
      headerSize="compact"
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
