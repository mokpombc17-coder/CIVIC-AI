import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatAuthenticationBoundary } from "@/components/chat-authentication-boundary";
import { ChatQueryProvider } from "@/components/chat-query-provider";
import { ChatRealtimeProvider } from "@/components/chat-realtime-provider";
import { ChatRoomReadStateProvider } from "@/components/chat-room-read-state-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <ChatQueryProvider>
      <ChatAuthenticationBoundary>
        <ChatRealtimeProvider>
          <ChatRoomReadStateProvider>{children}</ChatRoomReadStateProvider>
        </ChatRealtimeProvider>
      </ChatAuthenticationBoundary>
    </ChatQueryProvider>
  );
}
