"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { type QueryClient, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "@/lib/chat/chat-room-api";
import type {
  ChatMessage,
  MessageHistoryResponse,
  RoomMessageContextResponse,
} from "@/lib/chat/chat-room-contracts";
import { createChatMessageRenderKey } from "@/components/chat/chat-room-view-model";
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

export type RoomMessageContextPageResult = Readonly<{
  hasMore: boolean;
}>;

// 이동한 대화가 검색 결과로 이동한 것인지, 방에 들어올 때 읽은 위치로 이동한 것인지 구분함
// 종류에 따라 안 읽은 구분선 표시와 읽음 보고 여부가 달라짐
export type RoomMessageNavigationPurpose = "search" | "entry";

// 화면 맨 위 메시지와 그 메시지가 화면 위쪽에서 떨어진 높이
export type RoomMessageViewportAnchor = Readonly<{
  offsetFromViewportTop: number;
  renderKey: string;
}>;

// 재연결로 다시 연 이동한 대화가 끊기기 전 보던 위치로 돌아가는 데 필요한 정보
// 새 대화를 받는 동안 보여 줄 이전 메시지와 그동안 유지할 이전 timeline key를 함께 담음
type RoomMessageNavigationRestore = Readonly<{
  anchor: RoomMessageViewportAnchor | null;
  carriedMessages: readonly ChatMessage[];
  id: string;
  previousTimelineKey: string;
}>;

type RoomMessageNavigationSelectionBase = Readonly<{
  generation: number;
  purpose: RoomMessageNavigationPurpose;
  restore: RoomMessageNavigationRestore | null;
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

export type RoomMessageNavigationSelection = RoomMessageContextSelection | RoomMessageLiveSelection;

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
  const viewportAnchorRef = useRef<RoomMessageViewportAnchor | null>(null);
  const missedUpdatesRef = useRef(false);
  const restoreCountRef = useRef(0);
  // 연결이 끊긴 동안과 재연결 직후 복원 선택을 만들기 전까지는 generation이 달라도 이전 선택을 그대로 보여 줌
  // 여기서 선택을 비우면 보던 대화가 닫혀 최신 대화가 잠깐 보인 뒤 복원되므로 화면이 깜빡임
  const isCurrentSelection =
    selection?.roomId === roomId && selection.searchSessionGeneration === searchSessionGeneration;
  const activeSelection = isCurrentSelection ? selection : null;
  const activeContextSelection = activeSelection?.kind === "context" ? activeSelection : null;
  const selectionKey =
    activeContextSelection === null
      ? null
      : createRoomMessageContextSelectionKey(activeContextSelection);
  const contextGeneration = activeContextSelection?.generation ?? generation;
  const contextQuery = useRoomMessageContextQuery(
    roomId,
    activeContextSelection?.contextMessageId ?? INACTIVE_MESSAGE_CONTEXT_ID,
    {
      enabled: enabled && activeContextSelection !== null && contextGeneration === generation,
      generation: contextGeneration,
    },
  );
  const activeExtension =
    extension.key === selectionKey
      ? extension
      : createRoomMessageContextExtensionState(selectionKey);
  // 복원할 대화를 받는 동안에는 끊기기 전 메시지를 그대로 보여 줌
  // 받지 못하면 실제와 다른 내용을 계속 보여 주게 되므로 이전 메시지를 내리고 오류와 다시 시도를 보여 줌
  const showsCarriedMessages =
    activeContextSelection?.restore != null &&
    contextQuery.data === undefined &&
    !contextQuery.isError;
  const contextMessages = useMemo(
    () =>
      contextQuery.data
        ? mergeRoomMessageContextWindow(
            roomId,
            contextQuery.data,
            activeExtension.olderMessages,
            activeExtension.newerMessages,
          )
        : showsCarriedMessages
          ? activeContextSelection.restore!.carriedMessages
          : EMPTY_CHAT_MESSAGES,
    [
      activeContextSelection,
      activeExtension.newerMessages,
      activeExtension.olderMessages,
      contextQuery.data,
      roomId,
      showsCarriedMessages,
    ],
  );
  const messages = activeSelection?.kind === "live" ? liveMessages : contextMessages;
  const timelineKey =
    activeSelection === null
      ? null
      : showsCarriedMessages
        ? activeSelection.restore!.previousTimelineKey
        : createRoomMessageNavigationTimelineKey(activeSelection);
  const selectionRef = useRef(selection);
  const contextMessagesRef = useRef(contextMessages);
  const liveMessagesRef = useRef(liveMessages);

  // 재연결 때 effect에서 끊기기 전 선택과 메시지로 복원 선택을 만들도록 최신 값을 ref에 담음
  useLayoutEffect(() => {
    selectionRef.current = selection;
    contextMessagesRef.current = contextMessages;
    liveMessagesRef.current = liveMessages;
  });
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
    viewportAnchorRef.current = null;
    setSelection(null);
    dispatchExtension({ type: "reset", key: null });
  }, []);

  const navigateToMessage = useCallback(
    (messageId: string, purpose: RoomMessageNavigationPurpose = "search") => {
      operationGenerationRef.current += 1;
      loadingDirectionsRef.current.clear();
      viewportAnchorRef.current = null;
      const selectionBase: RoomMessageNavigationSelectionBase = {
        generation,
        purpose,
        restore: null,
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
          purpose,
          restore: null,
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
    async (direction: RoomMessageContextDirection): Promise<RoomMessageContextPageResult> => {
      const cursor = direction === "older" ? nextBeforeSequence : nextAfterSequence;

      if (
        activeContextSelection === null ||
        activeContextSelection.generation !== generation ||
        selectionKey === null ||
        contextQuery.data === undefined ||
        loadingDirectionsRef.current.has(direction) ||
        cursor === null
      ) {
        return { hasMore: cursor !== null };
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
          return { hasMore: response.hasMore };
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
        return { hasMore: response.hasMore };
      } catch (error) {
        if (operationGenerationRef.current === requestGeneration) {
          dispatchExtension({ type: "request-failed", direction, error, key: selectionKey });
        }

        // 불러오기 실패를 화면 전체 오류로 바꾸지 않고 호출한 쪽에 넘김
        // 보던 대화는 그대로 두고 다시 시도 버튼만 띄우기 위함
        throw error;
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
    const currentSelection = selectionRef.current;
    const lifecycle = resolveRoomMessageNavigationLifecycle({
      enabled,
      generation,
      missedUpdates: missedUpdatesRef.current,
      roomId,
      searchSessionGeneration,
      selection: currentSelection,
    });

    if (lifecycle === "hold") {
      missedUpdatesRef.current = true;
      return;
    }

    if (lifecycle === "keep") {
      return;
    }

    missedUpdatesRef.current = false;

    if (lifecycle === "restore" && currentSelection !== null) {
      restoreCountRef.current += 1;
      const restoredSelection = createRestoredRoomMessageNavigationSelection({
        anchor: viewportAnchorRef.current,
        contextMessages: contextMessagesRef.current,
        generation,
        liveMessages: liveMessagesRef.current,
        restoreId: `restored-${restoreCountRef.current}`,
        selection: currentSelection,
      });
      operationGenerationRef.current += 1;
      loadingDirectionsRef.current.clear();
      viewportAnchorRef.current = null;
      // 같은 generation이면 이전 대화가 같은 query key로 남아 새로 받지 않고 재사용될 수 있으므로 모두 지움
      // 복원 선택을 넣기 전에 동기로 지움. 비동기로 지우면 곧 만들어질 복원 대화까지 지울 수 있음
      removeRoomMessageContextQueries(queryClient, roomId);
      setSelection(restoredSelection);
      dispatchExtension({
        type: "reset",
        key:
          restoredSelection.kind === "context"
            ? createRoomMessageContextSelectionKey(restoredSelection)
            : null,
      });
      return;
    }

    operationGenerationRef.current += 1;
    loadingDirectionsRef.current.clear();
    viewportAnchorRef.current = null;
    setSelection(null);
    dispatchExtension({ type: "reset", key: null });
    void discardRoomMessageContextQueries(queryClient, roomId);
  }, [enabled, generation, queryClient, roomId, searchSessionGeneration]);

  const rememberViewportAnchor = useCallback((anchor: RoomMessageViewportAnchor) => {
    viewportAnchorRef.current = anchor;
  }, []);

  const targetMessageId = activeSelection?.targetMessageId ?? null;
  const targetMessage =
    targetMessageId === null
      ? undefined
      : messages.find((message) => message.messageId === targetMessageId);

  return {
    closeContext,
    error: activeContextSelection === null ? null : contextQuery.error,
    failedDirection: activeExtension.failedDirection,
    hasNewer: activeContextSelection !== null && nextAfterSequence !== null,
    hasOlder: activeContextSelection !== null && nextBeforeSequence !== null,
    isError: activeContextSelection !== null && contextQuery.isError,
    isLoadingNewer: activeExtension.isLoadingNewer,
    isLoadingOlder: activeExtension.isLoadingOlder,
    isPending: activeContextSelection !== null && contextQuery.isPending,
    loadNewer: () => loadDirection("newer"),
    loadOlder: () => loadDirection("older"),
    messages,
    mode: activeSelection?.kind ?? null,
    purpose: activeSelection?.purpose ?? null,
    navigateToMessage,
    rememberViewportAnchor,
    restoreAnchor: activeSelection?.restore?.anchor ?? null,
    openContext: navigateToMessage,
    retry: async () => {
      if (activeContextSelection === null) {
        return;
      }

      await contextQuery.refetch();
    },
    selectedMessageId: targetMessageId,
    targetMessageId,
    timelineKey,
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

export type RoomMessageNavigationLifecycle = "hold" | "keep" | "restore" | "reset";

// 방 세션 상태가 바뀔 때 이동 선택을 어떻게 할지 정함
// - hold: 연결이 끊긴 동안에는 보던 대화를 그대로 두고 다시 연결된 뒤 복원함
// - keep: 끊긴 적 없이 같은 generation이면 그대로 둠
// - restore: 다시 연결되면 끊긴 사이 수정·삭제를 놓쳤을 수 있어 보던 위치 주변을 새로 받음
//   같은 generation이어도 실시간 복구는 실시간 목록만 다시 받으므로 이동한 대화는 따로 새로 받아야 함
// - reset: 방이나 검색 session이 바뀌었거나 선택이 없으면 비움
export function resolveRoomMessageNavigationLifecycle({
  enabled,
  generation,
  missedUpdates,
  roomId,
  searchSessionGeneration,
  selection,
}: Readonly<{
  enabled: boolean;
  generation: number;
  missedUpdates: boolean;
  roomId: string;
  searchSessionGeneration: number;
  selection: RoomMessageNavigationSelection | null;
}>): RoomMessageNavigationLifecycle {
  if (
    selection === null ||
    selection.roomId !== roomId ||
    selection.searchSessionGeneration !== searchSessionGeneration
  ) {
    return "reset";
  }

  if (!enabled) {
    return "hold";
  }

  return missedUpdates || selection.generation !== generation ? "restore" : "keep";
}

// 재연결로 다시 연 이동한 대화를 만듦
// 실시간 목록은 재연결 때 실시간 복구가 다시 받으므로 그대로 두고, 이동한 대화는 끊기기 전 화면 맨 위 메시지 주변을 새로 받음
// 그 메시지가 이미 실시간 목록에 있으면 실시간 목록에서 같은 높이로 돌아감
export function createRestoredRoomMessageNavigationSelection({
  anchor,
  contextMessages,
  generation,
  liveMessages,
  restoreId,
  selection,
}: Readonly<{
  anchor: RoomMessageViewportAnchor | null;
  contextMessages: readonly ChatMessage[];
  generation: number;
  liveMessages: readonly Pick<ChatMessage, "messageId">[];
  restoreId: string;
  selection: RoomMessageNavigationSelection;
}>): RoomMessageNavigationSelection {
  if (selection.kind === "live") {
    return { ...selection, generation };
  }

  // 보던 위치를 아직 기억하지 못했거나 기억한 메시지가 지금 대화에 없으면 원래 이동 위치로 다시 이동함
  const anchorMessage =
    anchor === null
      ? undefined
      : contextMessages.find(
          (message) => createChatMessageRenderKey(message.clientMessageId) === anchor.renderKey,
        );
  const restoreMessageId = anchorMessage?.messageId ?? selection.contextMessageId;
  const restoreBase = {
    anchor: anchorMessage ? anchor : null,
    // 같은 generation에서 여러 번 복원해도 timeline key가 겹치지 않도록 복원마다 다른 id를 씀
    id: restoreId,
    previousTimelineKey: createRoomMessageNavigationTimelineKey(selection),
  };
  const selectionBase: RoomMessageNavigationSelectionBase = {
    generation,
    purpose: selection.purpose,
    restore: null,
    roomId: selection.roomId,
    searchSessionGeneration: selection.searchSessionGeneration,
  };

  if (liveMessages.some((message) => message.messageId === restoreMessageId)) {
    return {
      ...selectionBase,
      kind: "live",
      restore: { ...restoreBase, carriedMessages: EMPTY_CHAT_MESSAGES },
      targetMessageId: selection.targetMessageId,
    };
  }

  return {
    ...selectionBase,
    contextMessageId: restoreMessageId,
    kind: "context",
    restore: { ...restoreBase, carriedMessages: contextMessages },
    targetMessageId: selection.targetMessageId,
  };
}

// 화면이 같은 대화를 이어서 보여 주는지 판단하는 key
// 복원한 대화는 새로 받은 목록이라 원래 대화와 다른 key를 써서 화면이 보던 위치로 다시 맞추게 함
export function createRoomMessageNavigationTimelineKey(
  selection: RoomMessageNavigationSelection,
): string {
  const key = `${selection.kind}:${selection.targetMessageId}`;
  return selection.restore === null ? key : `${key}:${selection.restore.id}`;
}

function removeRoomMessageContextQueries(queryClient: QueryClient, roomId: string): void {
  const queryKey = chatRoomQueryKeys.messageContextsForRoom(roomId);

  void queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
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
