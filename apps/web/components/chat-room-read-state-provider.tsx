"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useChatRealtimeTransport } from "@/components/chat-realtime-provider";
import { ChatRoomReadStateCoordinator } from "@/lib/chat/chat-room-read-state-coordinator";
import { classifyChatRoomReadStateFailure } from "@/lib/chat/chat-room-read-state-error-policy";
import { attachChatRoomReadStateLifecycle } from "@/lib/chat/chat-room-read-state-lifecycle";
import { useUpdateRoomReadStateMutation } from "@/lib/chat/chat-room-mutations";
import { chatRoomQueryKeys } from "@/lib/chat/chat-room-queries";

const ChatRoomReadStateContext = createContext<ChatRoomReadStateCoordinator | null>(null);

export function ChatRoomReadStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const transport = useChatRealtimeTransport();
  const { mutateAsync } = useUpdateRoomReadStateMutation();
  const [coordinator] = useState(
    () =>
      new ChatRoomReadStateCoordinator({
        classifyFailure: classifyChatRoomReadStateFailure,
        onConfirmed: ({ readThroughSequence, roomId }) => {
          transport.confirmRoomReadState(roomId, readThroughSequence);
          void queryClient
            .invalidateQueries({
              queryKey: chatRoomQueryKeys.roomInboxes(),
            })
            .catch(() => undefined);
        },
        submit: async (roomId, throughSequence) => {
          const response = await mutateAsync({
            request: { throughSequence },
            roomId,
          });
          return response.readThroughSequence;
        },
      }),
  );

  useEffect(
    () =>
      attachChatRoomReadStateLifecycle({
        coordinator,
        onPeerConfirmed: () => {
          void queryClient
            .invalidateQueries({
              queryKey: chatRoomQueryKeys.roomInboxes(),
            })
            .catch(() => undefined);
        },
        target: window,
        transport,
      }),
    [coordinator, queryClient, transport],
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
