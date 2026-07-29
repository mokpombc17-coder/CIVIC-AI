import type { ReactNode } from "react";
import { ChatQueryProvider } from "@/components/chat-query-provider";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatQueryProvider>{children}</ChatQueryProvider>;
}
