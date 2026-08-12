"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { chatRoomExportApi, type ChatRoomExportApi } from "@/lib/chat/admin/chat-room-export-api";
import {
  ChatRoomExportController,
  type ChatRoomExportControllerSnapshot,
} from "@/lib/chat/admin/chat-room-export-controller";
import type { ChatRoomExportMode } from "@/lib/chat/admin/chat-room-export-contracts";
import { saveChatRoomExport } from "@/lib/chat/admin/chat-room-export-download";
import { createChatRoomExportErrorPresentation } from "@/lib/chat/admin/chat-room-export-error-presentation";

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
  const controller = useMemo(
    () => new ChatRoomExportController({ api, roomId, save }),
    [api, roomId, save],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => () => controller.dispose(), [controller]);

  return createRoomChatExportControllerView(controller, snapshot);
}

function createRoomChatExportControllerView(
  controller: ChatRoomExportController,
  snapshot: ChatRoomExportControllerSnapshot,
): RoomChatExportController {
  const errorPresentation =
    snapshot.error === null ? null : createChatRoomExportErrorPresentation(snapshot.error);

  return {
    activeMode: snapshot.activeMode,
    canRetry: errorPresentation?.canRetry ?? false,
    downloadFull: () => controller.download("FULL"),
    downloadIncremental: () => controller.download("INCREMENTAL"),
    error: snapshot.error,
    errorMessage: errorPresentation?.detail ?? null,
    errorTitle: errorPresentation?.title ?? null,
    isDownloading: snapshot.activeMode !== null,
    recommendedMode: errorPresentation?.recommendedMode ?? null,
    resetError: () => controller.resetError(),
    retry: () => controller.retry(),
  };
}
