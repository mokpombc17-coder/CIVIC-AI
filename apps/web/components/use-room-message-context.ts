"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "@/lib/chat/chat-room-api";
import type {
  ChatMessage,
  MessageHistoryResponse,
  RoomMessageContextResponse,
} from "@/lib/chat/chat-room-contracts";
import { mergeChatMessages } from "@/lib/chat/chat-message-merge";
import {
  DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
  chatRoomQueryKeys,
  useRoomMessageContextQuery,
} from "@/lib/chat/chat-room-queries";

const INACTIVE_MESSAGE_CONTEXT_ID = "inactive-message-context";
const MESSAGE_CONTEXT_CONTINUATION_LIMIT = 50;
const EMPTY_CHAT_MESSAGES: readonly ChatMessage[] = [];

export type RoomMessageContextDirection = "older" | "newer";

type RoomMessageContextSelection = Readonly<{
  generation: number;
  messageId: string;
  roomId: string;
  searchSessionGeneration: number;
}>;

export type RoomMessageContextExtensionState = Readonly<{
  error: unknown | null;
  failedDirection: RoomMessageContextDirection | null;
  isLoadingNewer: boolean;
  isLoadingOlder: boolean;
  key: string | null;
  newerMessages: readonly ChatMessage[];
  nextAfterSequence: number | null | undefined;
  nextBeforeSequence: number | null | undefined;
  olderMessages: readonly ChatMessage[];
}>;

export type RoomMessageContextExtensionAction =
  | Readonly<{ type: "reset"; key: string | null }>
  | Readonly<{ type: "request-started"; direction: RoomMessageContextDirection; key: string }>
  | Readonly<{
      type: "request-succeeded";
      direction: RoomMessageContextDirection;
      key: string;
      response: MessageHistoryResponse;
    }>
  | Readonly<{
      type: "request-failed";
      direction: RoomMessageContextDirection;
      error: unknown;
      key: string;
    }>;

export type UseRoomMessageContextParams = Readonly<{
  enabled: boolean;
  generation: number;
  searchSessionGeneration: number;
  api?: Pick<ChatRoomApi, "getRoomMessages">;
}>;

export function useRoomMessageContext(
  roomId: string,
  { enabled, generation, searchSessionGeneration, api = chatRoomApi }: UseRoomMessageContextParams,
) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useReducer(
    (
      _selection: RoomMessageContextSelection | null,
      nextSelection: RoomMessageContextSelection | null,
    ) => nextSelection,
    null,
  );
  const [extension, dispatchExtension] = useReducer(
    reduceRoomMessageContextExtensionState,
    createRoomMessageContextExtensionState(null),
  );
  const operationGenerationRef = useRef(0);
  const loadingDirectionsRef = useRef(new Set<RoomMessageContextDirection>());
  const isCurrentSelection =
    enabled &&
    selection?.roomId === roomId &&
    selection.generation === generation &&
    selection.searchSessionGeneration === searchSessionGeneration;
  const activeSelection = isCurrentSelection ? selection : null;
  const selectionKey =
    activeSelection === null ? null : createRoomMessageContextSelectionKey(activeSelection);
  const contextQuery = useRoomMessageContextQuery(
    roomId,
    activeSelection?.messageId ?? INACTIVE_MESSAGE_CONTEXT_ID,
    {
      enabled: activeSelection !== null,
      generation,
    },
  );
  const activeExtension =
    extension.key === selectionKey
      ? extension
      : createRoomMessageContextExtensionState(selectionKey);
  const messages = useMemo(
    () =>
      contextQuery.data
        ? mergeRoomMessageContextWindow(
            roomId,
            contextQuery.data,
            activeExtension.olderMessages,
            activeExtension.newerMessages,
          )
        : EMPTY_CHAT_MESSAGES,
    [activeExtension.newerMessages, activeExtension.olderMessages, contextQuery.data, roomId],
  );
  const nextBeforeSequence =
    activeExtension.nextBeforeSequence === undefined
      ? (contextQuery.data?.nextBeforeSequence ?? null)
      : activeExtension.nextBeforeSequence;
  const nextAfterSequence =
    activeExtension.nextAfterSequence === undefined
      ? (contextQuery.data?.nextAfterSequence ?? null)
      : activeExtension.nextAfterSequence;

  const closeContext = useCallback(() => {
    operationGenerationRef.current += 1;
    loadingDirectionsRef.current.clear();
    setSelection(null);
    dispatchExtension({ type: "reset", key: null });
    void discardRoomMessageContextQueries(queryClient, roomId);
  }, [queryClient, roomId]);

  const openContext = useCallback(
    (messageId: string) => {
      operationGenerationRef.current += 1;
      loadingDirectionsRef.current.clear();
      const nextSelection: RoomMessageContextSelection = {
        generation,
        messageId,
        roomId,
        searchSessionGeneration,
      };
      const nextKey = createRoomMessageContextSelectionKey(nextSelection);

      void discardRoomMessageContextQueries(queryClient, roomId);
      setSelection(nextSelection);
      dispatchExtension({ type: "reset", key: nextKey });
    },
    [generation, queryClient, roomId, searchSessionGeneration],
  );

  const loadDirection = useCallback(
    async (direction: RoomMessageContextDirection) => {
      if (
        activeSelection === null ||
        selectionKey === null ||
        contextQuery.data === undefined ||
        loadingDirectionsRef.current.has(direction)
      ) {
        return;
      }

      const cursor = direction === "older" ? nextBeforeSequence : nextAfterSequence;

      if (cursor === null) {
        return;
      }

      loadingDirectionsRef.current.add(direction);
      const requestGeneration = operationGenerationRef.current;
      dispatchExtension({ type: "request-started", direction, key: selectionKey });

      try {
        const response = await api.getRoomMessages(
          roomId,
          direction === "older"
            ? {
                mode: "before",
                beforeSequence: cursor,
                limit: MESSAGE_CONTEXT_CONTINUATION_LIMIT,
              }
            : {
                mode: "after",
                afterSequence: cursor,
                limit: MESSAGE_CONTEXT_CONTINUATION_LIMIT,
              },
        );

        if (operationGenerationRef.current !== requestGeneration) {
          return;
        }

        const contextQueryKey = chatRoomQueryKeys.messageContext(
          roomId,
          activeSelection.messageId,
          generation,
          DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
          DEFAULT_ROOM_MESSAGE_CONTEXT_SIZE,
        );
        queryClient.setQueryData<RoomMessageContextResponse>(contextQueryKey, (current) =>
          current
            ? extendRoomMessageContextResponse(roomId, current, response, direction)
            : current,
        );

        dispatchExtension({
          type: "request-succeeded",
          direction,
          key: selectionKey,
          response,
        });
      } catch (error) {
        if (operationGenerationRef.current !== requestGeneration) {
          return;
        }

        dispatchExtension({ type: "request-failed", direction, error, key: selectionKey });
      } finally {
        loadingDirectionsRef.current.delete(direction);
      }
    },
    [
      activeSelection,
      api,
      contextQuery.data,
      generation,
      nextAfterSequence,
      nextBeforeSequence,
      queryClient,
      roomId,
      selectionKey,
    ],
  );

  useEffect(() => {
    const loadingDirections = loadingDirectionsRef.current;

    operationGenerationRef.current += 1;
    loadingDirections.clear();
    setSelection(null);
    dispatchExtension({ type: "reset", key: null });
    void discardRoomMessageContextQueries(queryClient, roomId);

    return () => {
      operationGenerationRef.current += 1;
      loadingDirections.clear();
    };
  }, [enabled, generation, queryClient, roomId, searchSessionGeneration]);

  return {
    closeContext,
    error: activeSelection === null ? null : (contextQuery.error ?? activeExtension.error),
    failedDirection: activeExtension.failedDirection,
    hasNewer: contextQuery.data !== undefined && nextAfterSequence !== null,
    hasOlder: contextQuery.data !== undefined && nextBeforeSequence !== null,
    isError: activeSelection !== null && (contextQuery.isError || activeExtension.error !== null),
    isLoadingNewer: activeExtension.isLoadingNewer,
    isLoadingOlder: activeExtension.isLoadingOlder,
    isPending: activeSelection !== null && contextQuery.isPending,
    loadNewer: () => loadDirection("newer"),
    loadOlder: () => loadDirection("older"),
    messages,
    openContext,
    retry: async () => {
      if (activeExtension.failedDirection !== null) {
        await loadDirection(activeExtension.failedDirection);
        return;
      }

      await contextQuery.refetch();
    },
    selectedMessageId: activeSelection?.messageId ?? null,
    targetMessageId: contextQuery.data?.targetMessageId ?? activeSelection?.messageId ?? null,
    targetRoomSequence: contextQuery.data?.targetRoomSequence ?? null,
  };
}

export function mergeRoomMessageContextWindow(
  roomId: string,
  context: RoomMessageContextResponse,
  olderMessages: readonly ChatMessage[] = EMPTY_CHAT_MESSAGES,
  newerMessages: readonly ChatMessage[] = EMPTY_CHAT_MESSAGES,
): readonly ChatMessage[] {
  return mergeChatMessages({
    roomId,
    sources: [olderMessages, context.items, newerMessages],
  }).messages;
}

export function extendRoomMessageContextResponse(
  roomId: string,
  context: RoomMessageContextResponse,
  response: MessageHistoryResponse,
  direction: RoomMessageContextDirection,
): RoomMessageContextResponse {
  const items = mergeChatMessages({
    roomId,
    sources: [context.items, response.items],
  }).messages;

  return direction === "older"
    ? {
        ...context,
        hasOlder: response.hasMore,
        items: [...items],
        nextBeforeSequence: response.hasMore ? (response.nextBeforeSequence ?? null) : null,
      }
    : {
        ...context,
        hasNewer: response.hasMore,
        items: [...items],
        nextAfterSequence: response.hasMore ? (response.nextAfterSequence ?? null) : null,
      };
}

export async function discardRoomMessageContextQueries(
  queryClient: QueryClient,
  roomId: string,
): Promise<void> {
  const queryKey = chatRoomQueryKeys.messageContextsForRoom(roomId);

  await queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
}

export function reduceRoomMessageContextExtensionState(
  state: RoomMessageContextExtensionState,
  action: RoomMessageContextExtensionAction,
): RoomMessageContextExtensionState {
  if (action.type === "reset") {
    return createRoomMessageContextExtensionState(action.key);
  }

  if (state.key !== action.key) {
    return state;
  }

  if (action.type === "request-started") {
    return {
      ...state,
      error: null,
      failedDirection: null,
      isLoadingNewer: action.direction === "newer" ? true : state.isLoadingNewer,
      isLoadingOlder: action.direction === "older" ? true : state.isLoadingOlder,
    };
  }

  if (action.type === "request-failed") {
    return {
      ...state,
      error: action.error,
      failedDirection: action.direction,
      isLoadingNewer: action.direction === "newer" ? false : state.isLoadingNewer,
      isLoadingOlder: action.direction === "older" ? false : state.isLoadingOlder,
    };
  }

  if (action.direction === "older") {
    return {
      ...state,
      error: null,
      failedDirection: null,
      isLoadingOlder: false,
      nextBeforeSequence: action.response.hasMore
        ? (action.response.nextBeforeSequence ?? null)
        : null,
      olderMessages: [...action.response.items, ...state.olderMessages],
    };
  }

  return {
    ...state,
    error: null,
    failedDirection: null,
    isLoadingNewer: false,
    newerMessages: [...state.newerMessages, ...action.response.items],
    nextAfterSequence: action.response.hasMore ? (action.response.nextAfterSequence ?? null) : null,
  };
}

export function createRoomMessageContextExtensionState(
  key: string | null,
): RoomMessageContextExtensionState {
  return {
    error: null,
    failedDirection: null,
    isLoadingNewer: false,
    isLoadingOlder: false,
    key,
    newerMessages: EMPTY_CHAT_MESSAGES,
    nextAfterSequence: undefined,
    nextBeforeSequence: undefined,
    olderMessages: EMPTY_CHAT_MESSAGES,
  };
}

function createRoomMessageContextSelectionKey(selection: RoomMessageContextSelection): string {
  return JSON.stringify([
    selection.roomId,
    selection.generation,
    selection.searchSessionGeneration,
    selection.messageId,
  ]);
}
