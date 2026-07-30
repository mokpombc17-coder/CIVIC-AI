"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChatRealtimeQueryCoordinator,
  type ApplyChatRealtimeDeliveryResult,
} from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import { useChatRealtimeTransport } from "./chat-realtime-provider";

type UseChatRealtimeQueryCoordinatorParams = Readonly<{
  enabled: boolean;
  roomId: string;
  generation: number;
  limit?: number;
}>;

export type ChatRealtimeQueryCoordinatorState = Readonly<{
  error: Error | null;
  lastApplied: ApplyChatRealtimeDeliveryResult | null;
  retry: () => void;
}>;

export function useChatRealtimeQueryCoordinator({
  enabled,
  roomId,
  generation,
  limit,
}: UseChatRealtimeQueryCoordinatorParams): ChatRealtimeQueryCoordinatorState {
  const queryClient = useQueryClient();
  const transport = useChatRealtimeTransport();
  const coordinatorRef = useRef<ChatRealtimeQueryCoordinator | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastApplied, setLastApplied] = useState<ApplyChatRealtimeDeliveryResult | null>(null);

  useEffect(() => {
    if (!enabled) {
      coordinatorRef.current = null;
      return;
    }

    let active = true;
    const scheduleStateUpdate = (update: () => void) => {
      queueMicrotask(() => {
        if (active) {
          update();
        }
      });
    };
    const reportError = (cause: unknown) => {
      scheduleStateUpdate(() => {
        setError(toCoordinatorError(cause));
      });
    };
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId,
      generation,
      ...(limit === undefined ? {} : { limit }),
      onApplied(result) {
        scheduleStateUpdate(() => {
          setError(null);
          setLastApplied(result);
        });
      },
      onError: reportError,
    });
    coordinatorRef.current = coordinator;
    scheduleStateUpdate(() => {
      setError(null);
      setLastApplied(null);
    });
    coordinator.start();

    try {
      coordinator.notifyRoomSnapshotApplied();
    } catch (cause) {
      reportError(cause);
    }

    return () => {
      active = false;
      coordinator.stop();

      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, [enabled, generation, limit, queryClient, roomId, transport]);

  const retry = useCallback(() => {
    const coordinator = coordinatorRef.current;

    if (!coordinator) {
      return;
    }

    setError(null);
    coordinator.retryPendingDelivery();
  }, []);

  return {
    error,
    lastApplied,
    retry,
  };
}

function toCoordinatorError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다.");
}
