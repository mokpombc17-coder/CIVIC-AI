"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type QueryClient, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { ChatApiError } from "@/lib/chat/chat-fetch";
import { roomMessageSearchQuerySchema } from "@/lib/chat/chat-room-contracts";
import {
  chatRoomQueryKeys,
  DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT,
  flattenRoomMessageSearchPages,
  useRoomMessageSearchQuery,
} from "@/lib/chat/chat-room-queries";

const INACTIVE_ROOM_MESSAGE_SEARCH_QUERY = "검색";

export type RoomMessageSearchState = Readonly<{
  appliedQuery: string | undefined;
  draftQuery: string;
  invalidCursorRecoveryAttempted: boolean;
  isComposing: boolean;
  rateLimitRetryAfterMs: number | undefined;
  roomGeneration: number;
  roomId: string;
  sessionGeneration: number;
  validationMessage: string | undefined;
}>;

export type RoomMessageSearchAction =
  | Readonly<{ type: "draft-changed"; value: string }>
  | Readonly<{ type: "composition-started" }>
  | Readonly<{ type: "composition-ended" }>
  | Readonly<{ type: "submitted" }>
  | Readonly<{ type: "cleared" }>
  | Readonly<{ type: "invalid-cursor-recovered" }>
  | Readonly<{ type: "request-started" }>
  | Readonly<{ type: "request-succeeded" }>
  | Readonly<{ type: "rate-limit-scheduled"; retryAfterMs: number }>
  | Readonly<{ type: "rate-limit-finished" }>
  | Readonly<{ type: "room-context-changed"; roomId: string; roomGeneration: number }>;

export type UseRoomMessageSearchParams = Readonly<{
  enabled: boolean;
  generation: number;
  limit?: number;
}>;

export function createInitialRoomMessageSearchState(
  roomId: string,
  roomGeneration: number,
): RoomMessageSearchState {
  return {
    appliedQuery: undefined,
    draftQuery: "",
    invalidCursorRecoveryAttempted: false,
    isComposing: false,
    rateLimitRetryAfterMs: undefined,
    roomGeneration,
    roomId,
    sessionGeneration: 0,
    validationMessage: undefined,
  };
}

export function reduceRoomMessageSearchState(
  state: RoomMessageSearchState,
  action: RoomMessageSearchAction,
): RoomMessageSearchState {
  switch (action.type) {
    case "draft-changed":
      return {
        ...state,
        draftQuery: action.value,
        validationMessage: undefined,
      };
    case "composition-started":
      return {
        ...state,
        isComposing: true,
      };
    case "composition-ended":
      return {
        ...state,
        isComposing: false,
      };
    case "submitted": {
      if (state.isComposing) {
        return state;
      }

      const parsed = roomMessageSearchQuerySchema.safeParse(state.draftQuery);

      if (!parsed.success) {
        return {
          ...state,
          validationMessage:
            parsed.error.issues[0]?.message ?? "검색어는 2자 이상 100자 이내로 입력해 주세요.",
        };
      }

      return {
        ...state,
        appliedQuery: parsed.data,
        invalidCursorRecoveryAttempted: false,
        rateLimitRetryAfterMs: undefined,
        sessionGeneration: state.sessionGeneration + 1,
        validationMessage: undefined,
      };
    }
    case "cleared":
      return {
        ...createInitialRoomMessageSearchState(state.roomId, state.roomGeneration),
        sessionGeneration: state.sessionGeneration + 1,
      };
    case "invalid-cursor-recovered":
      if (state.appliedQuery === undefined || state.invalidCursorRecoveryAttempted) {
        return state;
      }

      return {
        ...state,
        invalidCursorRecoveryAttempted: true,
        rateLimitRetryAfterMs: undefined,
        sessionGeneration: state.sessionGeneration + 1,
      };
    case "request-started":
    case "request-succeeded":
      if (state.rateLimitRetryAfterMs === undefined) {
        return state;
      }

      return {
        ...state,
        rateLimitRetryAfterMs: undefined,
      };
    case "rate-limit-scheduled":
      return {
        ...state,
        rateLimitRetryAfterMs: action.retryAfterMs,
      };
    case "rate-limit-finished":
      if (state.rateLimitRetryAfterMs === undefined) {
        return state;
      }

      return {
        ...state,
        rateLimitRetryAfterMs: undefined,
      };
    case "room-context-changed":
      // 같은 방에서 재연결로 generation만 바뀌면 검색어는 유지하고 결과만 새 generation으로 다시 받음
      // 검색을 지우면 보던 대화는 복원돼도 검색 결과 사이를 이동할 수 없게 됨
      if (action.roomId === state.roomId) {
        return {
          ...state,
          invalidCursorRecoveryAttempted: false,
          rateLimitRetryAfterMs: undefined,
          roomGeneration: action.roomGeneration,
        };
      }

      return createInitialRoomMessageSearchState(action.roomId, action.roomGeneration);
  }
}

export function getRoomMessageSearchRateLimitDelay(error: unknown): number | undefined {
  if (
    !(error instanceof ChatApiError) ||
    error.code !== "MESSAGE_SEARCH_RATE_LIMITED" ||
    error.retryAfterMs === undefined
  ) {
    return undefined;
  }

  return error.retryAfterMs;
}

export function isRoomMessageSearchInvalidCursor(error: unknown): boolean {
  return error instanceof ChatApiError && error.code === "INVALID_CURSOR";
}

export async function discardRoomMessageSearchQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.removeQueries({ queryKey, exact: true });
}

export function useRoomMessageSearch(
  roomId: string,
  { enabled, generation, limit = DEFAULT_ROOM_MESSAGE_SEARCH_LIMIT }: UseRoomMessageSearchParams,
) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reduceRoomMessageSearchState, undefined, () =>
    createInitialRoomMessageSearchState(roomId, generation),
  );
  const automaticRateLimitRetryAttemptedRef = useRef(false);
  const suppressedRateLimitErrorRef = useRef<unknown>(null);
  const isCurrentRoomContext = state.roomId === roomId && state.roomGeneration === generation;
  const queryEnabled = enabled && isCurrentRoomContext && state.appliedQuery !== undefined;
  const normalizedLimit = limit;
  const query = useRoomMessageSearchQuery(roomId, {
    enabled: queryEnabled,
    generation,
    sessionGeneration: state.sessionGeneration,
    query: state.appliedQuery ?? INACTIVE_ROOM_MESSAGE_SEARCH_QUERY,
    limit: normalizedLimit,
  });
  const {
    error,
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetching,
    isFetchingNextPage,
    messages,
    refetch,
  } = query;
  const fetchNextPageRef = useRef(fetchNextPage);
  const refetchRef = useRef(refetch);

  useEffect(() => {
    fetchNextPageRef.current = fetchNextPage;
    refetchRef.current = refetch;
  }, [fetchNextPage, refetch]);
  const activeQueryKey = useMemo<QueryKey | null>(() => {
    if (state.appliedQuery === undefined) {
      return null;
    }

    return chatRoomQueryKeys.messageSearch(state.roomId, {
      generation: state.roomGeneration,
      sessionGeneration: state.sessionGeneration,
      query: state.appliedQuery,
      limit: normalizedLimit,
    });
  }, [
    normalizedLimit,
    state.appliedQuery,
    state.roomGeneration,
    state.roomId,
    state.sessionGeneration,
  ]);

  const discardActiveQuery = useCallback(() => {
    if (activeQueryKey !== null) {
      void discardRoomMessageSearchQuery(queryClient, activeQueryKey);
    }
  }, [activeQueryKey, queryClient]);

  useEffect(
    () => () => {
      if (activeQueryKey !== null) {
        void discardRoomMessageSearchQuery(queryClient, activeQueryKey);
      }
    },
    [activeQueryKey, queryClient],
  );

  useEffect(() => {
    if (isCurrentRoomContext) {
      return;
    }

    discardActiveQuery();
    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = null;
    dispatch({ type: "room-context-changed", roomId, roomGeneration: generation });
  }, [discardActiveQuery, generation, isCurrentRoomContext, roomId]);

  useEffect(() => {
    if (
      !queryEnabled ||
      !isRoomMessageSearchInvalidCursor(error) ||
      state.invalidCursorRecoveryAttempted
    ) {
      return;
    }

    discardActiveQuery();
    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = null;
    dispatch({ type: "invalid-cursor-recovered" });
  }, [discardActiveQuery, error, queryEnabled, state.invalidCursorRecoveryAttempted]);

  useEffect(() => {
    const retryAfterMs = getRoomMessageSearchRateLimitDelay(error);

    if (
      !queryEnabled ||
      retryAfterMs === undefined ||
      suppressedRateLimitErrorRef.current === error ||
      automaticRateLimitRetryAttemptedRef.current
    ) {
      return;
    }

    automaticRateLimitRetryAttemptedRef.current = true;
    dispatch({ type: "rate-limit-scheduled", retryAfterMs });
    const retryNextPage = isFetchNextPageError;
    const timer = globalThis.setTimeout(() => {
      dispatch({ type: "rate-limit-finished" });

      if (retryNextPage) {
        void fetchNextPageRef.current();
      } else {
        void refetchRef.current();
      }
    }, retryAfterMs);

    return () => globalThis.clearTimeout(timer);
  }, [error, isFetchNextPageError, queryEnabled, state.sessionGeneration]);

  useEffect(() => {
    if (error !== null || isFetching) {
      return;
    }

    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = null;
    dispatch({ type: "request-succeeded" });
  }, [error, isFetching]);

  const applySearch = useCallback(() => {
    if (state.isComposing || !roomMessageSearchQuerySchema.safeParse(state.draftQuery).success) {
      dispatch({ type: "submitted" });
      return;
    }

    discardActiveQuery();
    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = null;
    dispatch({ type: "submitted" });
  }, [discardActiveQuery, state.draftQuery, state.isComposing]);

  const clearSearch = useCallback(() => {
    discardActiveQuery();
    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = null;
    dispatch({ type: "cleared" });
  }, [discardActiveQuery]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) {
      return {
        hasNextPage: Boolean(hasNextPage),
        isError: error !== null,
        messages,
      };
    }

    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = error;
    dispatch({ type: "request-started" });
    const result = await fetchNextPage();

    return {
      hasNextPage: Boolean(result.hasNextPage),
      isError: result.isError,
      messages: flattenRoomMessageSearchPages(result.data?.pages),
    };
  }, [error, fetchNextPage, hasNextPage, isFetchingNextPage, messages]);

  const retry = useCallback(async () => {
    automaticRateLimitRetryAttemptedRef.current = false;
    suppressedRateLimitErrorRef.current = error;
    dispatch({ type: "request-started" });

    if (isFetchNextPageError) {
      await fetchNextPage();
      return;
    }

    await refetch();
  }, [error, fetchNextPage, isFetchNextPageError, refetch]);

  return {
    ...query,
    ...state,
    applySearch,
    clearSearch,
    endComposition: () => dispatch({ type: "composition-ended" }),
    loadMore,
    retry,
    setDraftQuery: (value: string) => dispatch({ type: "draft-changed", value }),
    startComposition: () => dispatch({ type: "composition-started" }),
  };
}
