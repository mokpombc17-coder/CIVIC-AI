"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ChatRoomReadStateCoordinator } from "@/lib/chat/chat-room-read-state-coordinator";
import { useUpdateRoomReadStateMutation } from "@/lib/chat/chat-room-mutations";

const ChatRoomReadStateContext = createContext<ChatRoomReadStateCoordinator | null>(null);

export function ChatRoomReadStateProvider({ children }: { children: ReactNode }) {
  const { mutateAsync } = useUpdateRoomReadStateMutation();
  const [coordinator] = useState(
    () =>
      new ChatRoomReadStateCoordinator({
        submit: async (roomId, throughSequence) => {
          const response = await mutateAsync({
            request: { throughSequence },
            roomId,
          });
          return response.readThroughSequence;
        },
      }),
  );

  return <ChatRoomReadStateContext value={coordinator}>{children}</ChatRoomReadStateContext>;
}

export function useChatRoomReadStateCoordinator(): ChatRoomReadStateCoordinator {
  const coordinator = useContext(ChatRoomReadStateContext);

  if (!coordinator) {
    throw new Error("채팅방 읽음 상태 훅은 ChatRoomReadStateProvider 안에서 사용해야 합니다.");
  }

  return coordinator;
}
