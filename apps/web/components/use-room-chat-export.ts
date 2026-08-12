"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chatRoomExportApi, type ChatRoomExportApi } from "@/lib/chat/admin/chat-room-export-api";
import type { ChatRoomExportMode } from "@/lib/chat/admin/chat-room-export-contracts";
import { saveChatRoomExport } from "@/lib/chat/admin/chat-room-export-download";
import {
  createChatRoomExportErrorPresentation,
  type ChatRoomExportErrorPresentation,
} from "@/lib/chat/admin/chat-room-export-error-presentation";
import { downloadAndSaveRoomChatExport } from "@/lib/chat/admin/chat-room-export-operation";

type RoomChatExportState = Readonly<{
  activeMode: ChatRoomExportMode | null;
  error: unknown | null;
  failedMode: ChatRoomExportMode | null;
  roomId: string;
}>;

const defaultDependencies = {
  api: chatRoomExportApi,
  save: saveChatRoomExport,
} as const;

type UseRoomChatExportDependencies = Readonly<{
  api?: Pick<ChatRoomExportApi, "download">;
  save?: typeof saveChatRoomExport;
}>;

export type RoomChatExportController = Readonly<{
  activeMode: ChatRoomExportMode | null;
  canRetry: boolean;
  downloadFull(): Promise<void>;
  downloadIncremental(): Promise<void>;
  error: unknown | null;
  errorMessage: string | null;
  errorTitle: string | null;
  isDownloading: boolean;
  recommendedMode: ChatRoomExportMode | null;
  resetError(): void;
  retry(): Promise<void>;
}>;

export function useRoomChatExport(
  roomId: string,
  dependencies: UseRoomChatExportDependencies = defaultDependencies,
): RoomChatExportController {
  const api = dependencies.api ?? defaultDependencies.api;
  const save = dependencies.save ?? defaultDependencies.save;
  const [state, setState] = useState<RoomChatExportState>(() => createInitialState(roomId));
  const activeOperationRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const nextOperationRef = useRef(0);
  const roomIdRef = useRef(roomId);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      activeOperationRef.current = null;
      nextOperationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    roomIdRef.current = roomId;
    activeOperationRef.current = null;
    nextOperationRef.current += 1;
  }, [roomId]);

  const execute = useCallback(
    async (mode: ChatRoomExportMode): Promise<void> => {
      if (activeOperationRef.current !== null) {
        return;
      }

      const operation = nextOperationRef.current + 1;
      nextOperationRef.current = operation;
      activeOperationRef.current = operation;
      setState({ activeMode: mode, error: null, failedMode: null, roomId });

      try {
        await downloadAndSaveRoomChatExport({
          api,
          input: { mode, roomId },
          save,
        });

        if (isCurrentOperation(operation, roomId, roomIdRef, activeOperationRef, mountedRef)) {
          setState(createInitialState(roomId));
        }
      } catch (error) {
        if (isCurrentOperation(operation, roomId, roomIdRef, activeOperationRef, mountedRef)) {
          setState({ activeMode: null, error, failedMode: mode, roomId });
        }
      } finally {
        if (activeOperationRef.current === operation) {
          activeOperationRef.current = null;
        }
      }
    },
    [api, roomId, save],
  );
  const currentState = state.roomId === roomId ? state : createInitialState(roomId);

  const errorPresentation = useMemo<ChatRoomExportErrorPresentation | null>(
    () =>
      currentState.error === null
        ? null
        : createChatRoomExportErrorPresentation(currentState.error),
    [currentState.error],
  );
  const downloadFull = useCallback(() => execute("FULL"), [execute]);
  const downloadIncremental = useCallback(() => execute("INCREMENTAL"), [execute]);
  const resetError = useCallback(() => {
    setState((current) =>
      current.roomId === roomId ? { ...current, error: null, failedMode: null } : current,
    );
  }, [roomId]);
  const retry = useCallback(async () => {
    if (!errorPresentation?.canRetry || currentState.failedMode === null) {
      return;
    }

    await execute(currentState.failedMode);
  }, [currentState.failedMode, errorPresentation?.canRetry, execute]);

  return {
    activeMode: currentState.activeMode,
    canRetry: errorPresentation?.canRetry ?? false,
    downloadFull,
    downloadIncremental,
    error: currentState.error,
    errorMessage: errorPresentation?.detail ?? null,
    errorTitle: errorPresentation?.title ?? null,
    isDownloading: currentState.activeMode !== null,
    recommendedMode: errorPresentation?.recommendedMode ?? null,
    resetError,
    retry,
  };
}

function createInitialState(roomId: string): RoomChatExportState {
  return {
    activeMode: null,
    error: null,
    failedMode: null,
    roomId,
  };
}

function isCurrentOperation(
  operation: number,
  roomId: string,
  roomIdRef: Readonly<{ current: string }>,
  activeOperationRef: Readonly<{ current: number | null }>,
  mountedRef: Readonly<{ current: boolean }>,
): boolean {
  return (
    mountedRef.current && activeOperationRef.current === operation && roomIdRef.current === roomId
  );
}
