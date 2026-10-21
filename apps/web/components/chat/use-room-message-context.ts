"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type QueryClient, type QueryKey, useQueryClient } from "@tanstack/react-query";
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

type RoomMessageNavigationSelectionBase = Readonly<{
  generation: number;
  roomId: string;
  searchSessionGeneration: number;
}>;

type RoomMessageContextSelection = RoomMessageNavigationSelectionBase &
  Readonly<{
    contextMessageId: string;
    kind: "context";
    targetMessageId: string;
  }>;

type RoomMessageLiveSelection = RoomMessageNavigationSelectionBase &
  Readonly<{
    kind: "live";
    targetMessageId: string;
  }>;

type RoomMessageNavigationSelection = RoomMessageContextSelection | RoomMessageLiveSelection;

export type RoomMessageNavigationDestination =
  | Readonly<{ kind: "live" }>
  | Readonly<{
      contextMessageId: string;
      kind: "context";
      source: "cache" | "current" | "remote";
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
  liveMessages?: readonly ChatMessage[];
  searchSessionGeneration: number;
  api?: Pick<ChatRoomApi, "getRoomMessages">;
}>;

type UseRoomMessageNavigationParams = Readonly<{
  enabled: boolean;
  generation: number;
  liveMessages: readonly ChatMessage[];
}>;

export function useRoomMessageContext(
  roomId: string,
  {
    enabled,
    generation,
    liveMessages = EMPTY_CHAT_MESSAGES,
    searchSessionGeneration,
    api = chatRoomApi,
  }: UseRoomMessageContextParams,
) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useReducer(
    (
      _selection: RoomMessageNavigationSelection | null,
      nextSelection: RoomMessageNavigationSelection | null,
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
  const activeContextSelection = activeSelection?.kind === "context" ? activeSelection : null;
  const selectionKey =
    activeContextSelection === null
      ? null
      : createRoomMessageContextSelectionKey(activeContextSelection);
  const contextQuery = useRoomMessageContextQuery(
    roomId,
    activeContextSelection?.contextMessageId ?? INACTIVE_MESSAGE_CONTEXT_ID,
    {
      enabled: activeContextSelection !== null,
      generation,
    },
  );
  const activeExtension =
    extension.key === selectionKey
      ? extension
      : createRoomMessageContextExtensionState(selectionKey);
  const contextMessages = useMemo(
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
  const messages = activeSelection?.kind === "live" ? liveMessages : contextMessages;
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
  }, []);

  const navigateToMessage = useCallback(
    (messageId: string) => {
      operationGenerationRef.current += 1;
      loadingDirectionsRef.current.clear();
      const selectionBase: RoomMessageNavigationSelectionBase = {
        generation,
        roomId,
        searchSessionGeneration,
      };

      const destination = resolveRoomMessageNavigationDestination({
        activeContextMessageId: activeContextSelection?.contextMessageId ?? null,
        contextMessages,
        generation,
        liveMessages,
        messageId,
        queryClient,
        roomId,
      });

      if (destination.kind === "live") {
        setSelection({
          ...selectionBase,
          kind: "live",
          targetMessageId: messageId,
        });
        dispatchExtension({ type: "reset", key: null });
        return;
      }

      if (destination.source === "current" && activeContextSelection !== null) {
        setSelection({
          ...activeContextSelection,
          targetMessageId: messageId,
        });
        return;
      }

      const nextSelection: RoomMessageContextSelection = {
        ...selectionBase,
        contextMessageId: destination.contextMessageId,
        kind: "context",
        targetMessageId: messageId,
      };
      const nextKey = createRoomMessageContextSelectionKey(nextSelection);

      setSelection(nextSelection);
      dispatchExtension({ type: "reset", key: nextKey });
    },
    [
      activeContextSelection,
      contextMessages,
      generation,
      liveMessages,
      queryClient,
      roomId,
      searchSessionGeneration,
    ],
  );

  const loadDirection = useCallback(
    async (direction: RoomMessageContextDirection) => {
      if (
        activeContextSelection === null ||
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
          activeContextSelection.contextMessageId,
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
      activeContextSelection,
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

  const targetMessageId = activeSelection?.targetMessageId ?? null;
  const targetMessage =
    targetMessageId === null
      ? undefined
      : messages.find((message) => message.messageId === targetMessageId);

  return {
    closeContext,
    error: activeContextSelection === null ? null : (contextQuery.error ?? activeExtension.error),
    failedDirection: activeExtension.failedDirection,
    hasNewer: activeContextSelection !== null && nextAfterSequence !== null,
    hasOlder: activeContextSelection !== null && nextBeforeSequence !== null,
    isError:
      activeContextSelection !== null && (contextQuery.isError || activeExtension.error !== null),
    isLoadingNewer: activeExtension.isLoadingNewer,
    isLoadingOlder: activeExtension.isLoadingOlder,
    isPending: activeContextSelection !== null && contextQuery.isPending,
    loadNewer: () => loadDirection("newer"),
    loadOlder: () => loadDirection("older"),
    messages,
    mode: activeSelection?.kind ?? null,
    navigateToMessage,
    openContext: navigateToMessage,
    retry: async () => {
      if (activeContextSelection === null) {
        return;
      }

      if (activeExtension.failedDirection !== null) {
        await loadDirection(activeExtension.failedDirection);
        return;
      }

      await contextQuery.refetch();
    },
    selectedMessageId: targetMessageId,
    targetMessageId,
    targetRoomSequence: targetMessage?.roomSequence ?? null,
  };
}

export function useRoomMessageNavigation(
  roomId: string,
  { enabled, generation, liveMessages }: UseRoomMessageNavigationParams,
) {
  return useRoomMessageContext(roomId, {
    enabled,
    generation,
    liveMessages,
    searchSessionGeneration: 0,
  });
}

export type RoomMessageContextController = ReturnType<typeof useRoomMessageNavigation>;

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

export function resolveRoomMessageNavigationDestination({
  activeContextMessageId,
  contextMessages,
  generation,
  liveMessages,
  messageId,
  queryClient,
  roomId,
}: Readonly<{
  activeContextMessageId: string | null;
  contextMessages: readonly Pick<ChatMessage, "messageId">[];
  generation: number;
  liveMessages: readonly Pick<ChatMessage, "messageId">[];
  messageId: string;
  queryClient: Pick<QueryClient, "getQueriesData">;
  roomId: string;
}>): RoomMessageNavigationDestination {
  if (liveMessages.some((message) => message.messageId === messageId)) {
    return { kind: "live" };
  }

  if (
    activeContextMessageId !== null &&
    contextMessages.some((message) => message.messageId === messageId)
  ) {
    return {
      contextMessageId: activeContextMessageId,
      kind: "context",
      source: "current",
    };
  }

  const cachedContextMessageId = findCachedRoomMessageContextTarget({
    generation,
    messageId,
    queryClient,
    roomId,
  });

  return {
    contextMessageId: cachedContextMessageId ?? messageId,
    kind: "context",
    source: cachedContextMessageId === null ? "remote" : "cache",
  };
}

export function findCachedRoomMessageContextTarget({
  generation,
  messageId,
  queryClient,
  roomId,
}: Readonly<{
  generation: number;
  messageId: string;
  queryClient: Pick<QueryClient, "getQueriesData">;
  roomId: string;
}>): string | null {
  const queryKey = chatRoomQueryKeys.messageContextsForRoom(roomId);

  for (const [cachedQueryKey, context] of queryClient.getQueriesData<RoomMessageContextResponse>({
    queryKey,
  })) {
    if (
      context === undefined ||
      getRoomMessageContextQueryGeneration(cachedQueryKey) !== generation ||
      !context.items.some((message) => message.messageId === messageId)
    ) {
      continue;
    }

    return context.targetMessageId;
  }

  return null;
}

function getRoomMessageContextQueryGeneration(queryKey: QueryKey): number | null {
  const criteria = queryKey.at(-1);

  if (criteria === null || typeof criteria !== "object" || !("generation" in criteria)) {
    return null;
  }

  return typeof criteria.generation === "number" ? criteria.generation : null;
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
    selection.contextMessageId,
  ]);
}
