"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChatRealtimeQueryCoordinator,
  type ApplyChatRealtimeDeliveryResult,
} from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import { ChatRealtimeSnapshotRefreshPolicy } from "@/lib/chat/realtime/chat-realtime-snapshot-refresh-policy";
import { useChatRealtimeTransport } from "./chat-realtime-provider";

type UseChatRealtimeQueryCoordinatorParams = Readonly<{
  enabled: boolean;
  roomId: string;
  generation: number;
  limit?: number;
  messageVisibleAfterSequence: number;
  watermarkSequence: number;
}>;

export type ChatRealtimeQueryCoordinatorState = Readonly<{
  error: Error | null;
  isRecovering: boolean;
  isSynchronized: boolean;
  lastApplied: ApplyChatRealtimeDeliveryResult | null;
  retry: () => void;
}>;

export function useChatRealtimeQueryCoordinator({
  enabled,
  roomId,
  generation,
  limit,
  messageVisibleAfterSequence,
  watermarkSequence,
}: UseChatRealtimeQueryCoordinatorParams): ChatRealtimeQueryCoordinatorState {
  const queryClient = useQueryClient();
  const transport = useChatRealtimeTransport();
  const snapshotRefreshPolicyRef = useRef(new ChatRealtimeSnapshotRefreshPolicy());
  const coordinatorRef = useRef<ChatRealtimeQueryCoordinator | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSynchronized, setIsSynchronized] = useState(false);
  const [lastApplied, setLastApplied] = useState<ApplyChatRealtimeDeliveryResult | null>(null);

  useEffect(() => {
    if (!enabled) {
      coordinatorRef.current = null;
      snapshotRefreshPolicyRef.current.deactivate(roomId, generation);
      return;
    }

    let active = true;
    const refreshLoadedPagesBeforeSnapshot = snapshotRefreshPolicyRef.current.activate(
      roomId,
      generation,
    );
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
        setIsRecovering(false);
        setIsSynchronized(false);
      });
    };
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId,
      generation,
      ...(limit === undefined ? {} : { limit }),
      messageVisibleAfterSequence,
      refreshLoadedPagesBeforeSnapshot,
      watermarkSequence,
      onApplied(result) {
        scheduleStateUpdate(() => {
          setError(null);
          setIsRecovering(false);
          setIsSynchronized(true);
          setLastApplied(result);
        });
      },
      onError: reportError,
      onRecoveryStarted() {
        scheduleStateUpdate(() => {
          setError(null);
          setIsRecovering(true);
          setIsSynchronized(false);
        });
      },
      onSnapshotRefreshStarted() {
        scheduleStateUpdate(() => {
          setError(null);
          setIsRecovering(true);
          setIsSynchronized(false);
        });
      },
      onRecovered() {
        scheduleStateUpdate(() => {
          setError(null);
          setIsRecovering(false);
        });
      },
      onSynchronized() {
        scheduleStateUpdate(() => {
          setError(null);
          setIsRecovering(false);
          setIsSynchronized(true);
        });
      },
    });
    coordinatorRef.current = coordinator;
    scheduleStateUpdate(() => {
      setError(null);
      setIsRecovering(false);
      setIsSynchronized(false);
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
  }, [
    enabled,
    generation,
    limit,
    messageVisibleAfterSequence,
    queryClient,
    roomId,
    transport,
    watermarkSequence,
  ]);

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
    isRecovering,
    isSynchronized,
    lastApplied,
    retry,
  };
}

function toCoordinatorError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다.");
}
