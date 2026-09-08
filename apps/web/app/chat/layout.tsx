import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatAuthenticationBoundary } from "@/components/chat-authentication-boundary";
import { ChatRoomListLoading } from "@/components/chat-room-list-loading";
import { ChatQueryProvider } from "@/components/chat-query-provider";
import { ChatRealtimeProvider } from "@/components/chat-realtime-provider";
import { ChatRoomReadStateProvider } from "@/components/chat-room-read-state-provider";
import { ServiceEligibilityGuard } from "@/components/service-eligibility-guard";

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <ChatQueryProvider>
      <ChatAuthenticationBoundary>
        <ServiceEligibilityGuard
          headerSize="compact"
          loadingFallback={<ChatRoomListLoading />}
          title="토론방"
        >
          <ChatRealtimeProvider>
            <ChatRoomReadStateProvider>{children}</ChatRoomReadStateProvider>
          </ChatRealtimeProvider>
        </ServiceEligibilityGuard>
      </ChatAuthenticationBoundary>
    </ChatQueryProvider>
  );
}
