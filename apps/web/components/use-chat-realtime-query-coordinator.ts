"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChatRealtimeQueryCoordinator,
  type ApplyChatRealtimeDeliveryResult,
} from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import { ChatRealtimeSnapshotRefreshPolicy } from "@/lib/chat/realtime/chat-realtime-snapshot-refresh-policy";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";
import {
  initialChatRealtimeQueryCoordinatorState,
  reduceChatRealtimeQueryCoordinatorState,
  type ChatRealtimeQueryCoordinatorStateEvent,
} from "./chat-realtime-query-coordinator-state";
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
  readReceiptError: Error | null;
  readReceiptStatus: ChatRoomReadReceiptSyncStatus;
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
  const [state, dispatch] = useReducer(
    reduceChatRealtimeQueryCoordinatorState,
    initialChatRealtimeQueryCoordinatorState,
  );

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
    const scheduleStateUpdate = (event: ChatRealtimeQueryCoordinatorStateEvent) => {
      queueMicrotask(() => {
        if (active) {
          dispatch(event);
        }
      });
    };
    const reportError = (cause: unknown) => {
      scheduleStateUpdate({ cause, type: "coordinatorFailed" });
    };
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId,
      generation,
      ...(limit === undefined ? {} : { limit }),
      messageVisibleAfterSequence,
      refreshLoadedPagesBeforeSnapshot,
      watermarkSequence,
      onApplied(result) {
        scheduleStateUpdate({ result, type: "deliveryApplied" });
      },
      onError: reportError,
      onRecoveryStarted() {
        scheduleStateUpdate({ type: "recoveryStarted" });
      },
      onSnapshotRefreshStarted() {
        scheduleStateUpdate({ type: "recoveryStarted" });
      },
      onRecovered() {
        scheduleStateUpdate({ type: "recoveryCompleted" });
      },
      onSynchronized() {
        scheduleStateUpdate({ type: "synchronized" });
      },
      readReceipt: {
        onError(cause) {
          scheduleStateUpdate({ cause, type: "readReceiptFailed" });
        },
        onStateChange(snapshot) {
          scheduleStateUpdate({
            error: snapshot.error,
            status: snapshot.status,
            type: "readReceiptStateChanged",
          });
        },
      },
    });
    coordinatorRef.current = coordinator;
    scheduleStateUpdate({ type: "coordinatorStarted" });
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

    dispatch({ type: "retryRequested" });
    coordinator.retryPendingDelivery();
  }, []);

  return {
    error: state.error,
    isRecovering: state.isRecovering,
    isSynchronized: state.isSynchronized,
    lastApplied: state.lastApplied,
    readReceiptError: enabled ? state.readReceiptError : null,
    readReceiptStatus: enabled ? state.readReceiptStatus : "idle",
    retry,
  };
}
