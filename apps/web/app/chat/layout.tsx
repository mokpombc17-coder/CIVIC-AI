import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatQueryProvider } from "@/components/chat-query-provider";
import { ChatRealtimeProvider } from "@/components/chat-realtime-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <ChatQueryProvider>
      <ChatRealtimeProvider>{children}</ChatRealtimeProvider>
    </ChatQueryProvider>
  );
}
