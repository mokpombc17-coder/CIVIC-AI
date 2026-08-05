"use client";

import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomInboxListResponse } from "@/lib/chat/chat-room-contracts";
import { chatRoomQueryKeys } from "@/lib/chat/chat-room-queries";
import { ChatRoomInboxEventCoordinator } from "@/lib/chat/realtime/chat-room-inbox-event-coordinator";
import type { ChatRealtimeTransport } from "@/lib/chat/realtime/chat-realtime-transport";
import type { ChatRoomInboxEvent } from "@/lib/chat/realtime/chat-stomp-contracts";

const ROOM_INBOX_TOAST_GROUPING_MS = 3_000;
const ROOM_INBOX_TOAST_DURATION_MS = 6_000;
const ROOM_INBOX_TOAST_LIMIT = 3;

type RoomInboxCreatedEvent = Extract<ChatRoomInboxEvent, { cause: "MESSAGE_CREATED" }>;

export type RoomInboxToast = Readonly<{
  count: number;
  preview: string;
  roomId: string;
  roomName: string;
  updatedAt: number;
}>;

export function useChatRoomInboxRuntime(transport: ChatRealtimeTransport) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [toasts, setToasts] = useState<readonly RoomInboxToast[]>([]);
  const toastTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((roomId: string) => {
    const timer = toastTimers.current.get(roomId);

    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(roomId);
    }

    setToasts((current) => current.filter((toast) => toast.roomId !== roomId));
  }, []);

  const showCreateToast = useCallback(
    (event: RoomInboxCreatedEvent, unseenCount: number) => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        return;
      }

      const roomSnapshot = transport.getRoomSnapshot();

      if (roomSnapshot.status === "active" && roomSnapshot.roomId === event.roomId) {
        return;
      }

      const updatedAt = Date.now();
      const roomName = getCachedRoomName(queryClient, event.roomId) ?? event.roomNameHint;
      const preview = event.notificationHint.previewTruncated
        ? `${event.notificationHint.preview}…`
        : event.notificationHint.preview;

      setToasts((current) => {
        const existing = current.find((toast) => toast.roomId === event.roomId);
        const nextToast: RoomInboxToast = {
          count:
            existing && updatedAt - existing.updatedAt <= ROOM_INBOX_TOAST_GROUPING_MS
              ? existing.count + unseenCount
              : unseenCount,
          preview: preview || "새 메시지가 도착했습니다.",
          roomId: event.roomId,
          roomName,
          updatedAt,
        };

        return [nextToast, ...current.filter((toast) => toast.roomId !== event.roomId)].slice(
          0,
          ROOM_INBOX_TOAST_LIMIT,
        );
      });

      const currentTimer = toastTimers.current.get(event.roomId);

      if (currentTimer) {
        clearTimeout(currentTimer);
      }

      toastTimers.current.set(
        event.roomId,
        setTimeout(() => dismissToast(event.roomId), ROOM_INBOX_TOAST_DURATION_MS),
      );
    },
    [dismissToast, queryClient, transport],
  );

  useEffect(() => {
    const coordinator = new ChatRoomInboxEventCoordinator({
      onCreate: showCreateToast,
      onInvalidate: () => {
        void queryClient
          .invalidateQueries({ queryKey: chatRoomQueryKeys.roomInboxes() })
          .catch(() => undefined);
      },
    });
    let previousConnectionStatus = transport.getSnapshot().status;
    const stopInboxEvents = transport.observeRoomInboxEvent((event) => coordinator.handle(event));
    const stopConnection = transport.observe(() => {
      const connectionStatus = transport.getSnapshot().status;

      if (connectionStatus === "connected" && previousConnectionStatus !== "connected") {
        coordinator.requestInvalidation();
      }

      previousConnectionStatus = connectionStatus;
    });
    const requestInvalidation = () => coordinator.requestInvalidation();

    window.addEventListener("focus", requestInvalidation);
    window.addEventListener("online", requestInvalidation);

    return () => {
      stopConnection();
      stopInboxEvents();
      window.removeEventListener("focus", requestInvalidation);
      window.removeEventListener("online", requestInvalidation);
      coordinator.dispose();
    };
  }, [queryClient, showCreateToast, transport]);

  useEffect(
    () => () => {
      toastTimers.current.forEach((timer) => clearTimeout(timer));
      toastTimers.current.clear();
    },
    [],
  );

  const selectToast = useCallback(
    (roomId: string) => {
      dismissToast(roomId);
      router.push(`/chat/${encodeURIComponent(roomId)}`);
    },
    [dismissToast, router],
  );

  return { selectToast, toasts };
}

export function getCachedRoomName(queryClient: QueryClient, roomId: string): string | null {
  const inboxQueries = queryClient.getQueriesData<InfiniteData<RoomInboxListResponse>>({
    queryKey: chatRoomQueryKeys.roomInboxes(),
  });

  for (const [, data] of inboxQueries) {
    for (const page of data?.pages ?? []) {
      const room = page.items.find((item) => item.roomId === roomId);

      if (room) {
        return room.name;
      }
    }
  }

  return null;
}
