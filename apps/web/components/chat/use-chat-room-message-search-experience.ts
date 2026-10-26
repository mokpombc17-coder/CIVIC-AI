"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatRoomMessageSearchPanel } from "@/components/chat/use-chat-room-message-search-dialog";
import { useRoomMessageSearch } from "@/components/chat/use-room-message-search";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";
import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";

type ChatRoomMessageSearchExperienceOptions = Readonly<{
  generation: number;
  onNavigateToMessage: (messageId: string) => void;
  roomActive: boolean;
  sessionKind: ChatRoomSessionView["kind"];
}>;

type ChatRoomMessageSearchCloseActions = Readonly<{
  clearSearch: () => void;
  closeDialog: () => void;
}>;

type ChatRoomMessageSearchSelection = Readonly<{
  messageId: string;
  sessionKey: string;
}>;

export type ChatRoomMessageSearchNavigationState = Readonly<{
  canNavigateNewer: boolean;
  canNavigateOlder: boolean;
  currentResultIndex: number | null;
}>;

export function useChatRoomMessageSearchExperience(
  roomId: string,
  {
    generation,
    onNavigateToMessage,
    roomActive,
    sessionKind,
  }: ChatRoomMessageSearchExperienceOptions,
) {
  const panel = useChatRoomMessageSearchPanel(roomId);
  const controller = useRoomMessageSearch(roomId, {
    enabled: roomActive && panel.isOpen,
    generation,
  });
  const {
    appliedQuery,
    clearSearch,
    data,
    hasNextPage,
    isError,
    isFetching,
    loadMore,
    messages,
    rateLimitRetryAfterMs,
    sessionGeneration,
  } = controller;
  // 사용자가 실행한 검색은 재연결로 generation이 바뀌어도 같은 검색으로 보고 선택한 결과를 유지함
  // generation을 넣으면 재연결 때 현재 결과로 자동 이동해 보던 대화 복원을 덮어씀
  const searchSessionKey = `${roomId}:${sessionGeneration}`;
  // 받아 온 결과 목록은 generation마다 새로 받으므로 다음 page 자동 조회와 이전 결과 찾기는 이 key로 구분함
  const searchResultsKey = `${roomId}:${generation}:${sessionGeneration}`;
  const latestSearchResultsKeyRef = useRef(searchResultsKey);
  const automaticNavigationKeyRef = useRef<string | null>(null);
  const automaticPageLoadKeyRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<ChatRoomMessageSearchSelection | null>(null);
  const [seekingOlderSessionKey, setSeekingOlderSessionKey] = useState<string | null>(null);
  const selectedMessageId = selection?.sessionKey === searchSessionKey ? selection.messageId : null;
  const currentResultMessageId =
    selectedMessageId !== null &&
    messages.some((message) => message.messageId === selectedMessageId)
      ? selectedMessageId
      : (messages[0]?.messageId ?? null);
  const isSeekingOlderResult = seekingOlderSessionKey === searchSessionKey;
  const { close: closeDialog } = panel;
  const close = useCallback(() => {
    latestSearchResultsKeyRef.current = `closed:${searchResultsKey}`;
    closeChatRoomMessageSearchExperience({
      clearSearch,
      closeDialog,
    });
  }, [clearSearch, closeDialog, searchResultsKey]);
  const navigationState = useMemo(
    () =>
      createChatRoomMessageSearchNavigationState({
        currentResultMessageId,
        hasNextPage,
        isError,
        messages,
      }),
    [currentResultMessageId, hasNextPage, isError, messages],
  );
  const navigateToMessage = useCallback(
    (message: ChatMessage) => {
      const navigationKey = `${searchSessionKey}:${message.messageId}`;
      automaticNavigationKeyRef.current = navigationKey;
      setSelection({ messageId: message.messageId, sessionKey: searchSessionKey });
      onNavigateToMessage(message.messageId);
    },
    [onNavigateToMessage, searchSessionKey],
  );
  const navigateToNewerResult = useCallback(() => {
    const currentIndex = navigationState.currentResultIndex;
    const nextMessage =
      currentIndex === null || currentIndex <= 0 ? undefined : messages[currentIndex - 1];

    if (nextMessage) {
      navigateToMessage(nextMessage);
    }
  }, [messages, navigateToMessage, navigationState.currentResultIndex]);
  const navigateToOlderResult = useCallback(async () => {
    const currentIndex = navigationState.currentResultIndex;

    if (currentIndex === null || isSeekingOlderResult) {
      return;
    }

    const nextMessage = messages[currentIndex + 1];

    if (nextMessage) {
      navigateToMessage(nextMessage);
      return;
    }

    if (!hasNextPage || isError || currentResultMessageId === null) {
      return;
    }

    const requestedSessionKey = searchSessionKey;
    const requestedResultsKey = searchResultsKey;
    const originMessageId = currentResultMessageId;
    setSeekingOlderSessionKey(requestedSessionKey);

    try {
      while (latestSearchResultsKeyRef.current === requestedResultsKey) {
        const result = await loadMore();

        if (latestSearchResultsKeyRef.current !== requestedResultsKey || result.isError) {
          return;
        }

        const originIndex = result.messages.findIndex(
          (message) => message.messageId === originMessageId,
        );
        const nextOlderMessage = originIndex < 0 ? undefined : result.messages[originIndex + 1];

        if (nextOlderMessage) {
          navigateToMessage(nextOlderMessage);
          return;
        }

        if (!result.hasNextPage) {
          return;
        }
      }
    } finally {
      setSeekingOlderSessionKey((current) => (current === requestedSessionKey ? null : current));
    }
  }, [
    currentResultMessageId,
    hasNextPage,
    isError,
    isSeekingOlderResult,
    loadMore,
    messages,
    navigateToMessage,
    navigationState.currentResultIndex,
    searchResultsKey,
    searchSessionKey,
  ]);

  useEffect(() => {
    latestSearchResultsKeyRef.current = searchResultsKey;
  }, [searchResultsKey]);

  useEffect(() => {
    if (appliedQuery === undefined || currentResultMessageId === null) {
      return;
    }

    const navigationKey = `${searchSessionKey}:${currentResultMessageId}`;

    if (automaticNavigationKeyRef.current === navigationKey) {
      return;
    }

    automaticNavigationKeyRef.current = navigationKey;
    onNavigateToMessage(currentResultMessageId);
  }, [appliedQuery, currentResultMessageId, onNavigateToMessage, searchSessionKey]);

  useEffect(() => {
    if (
      appliedQuery === undefined ||
      messages.length > 0 ||
      !hasNextPage ||
      isError ||
      isFetching ||
      rateLimitRetryAfterMs !== undefined
    ) {
      return;
    }

    const loadedPageCount = data?.pages.length ?? 0;
    const pageLoadKey = `${searchResultsKey}:${loadedPageCount}`;

    if (automaticPageLoadKeyRef.current === pageLoadKey) {
      return;
    }

    automaticPageLoadKeyRef.current = pageLoadKey;
    void loadMore();
  }, [
    appliedQuery,
    data?.pages.length,
    hasNextPage,
    isError,
    isFetching,
    loadMore,
    messages.length,
    rateLimitRetryAfterMs,
    searchResultsKey,
  ]);

  useEffect(() => {
    if (shouldCloseChatRoomMessageSearchExperience(panel.isOpen, sessionKind)) {
      close();
    }
  }, [close, panel.isOpen, sessionKind]);

  return {
    close,
    controller,
    isOpen: panel.isOpen,
    navigation: {
      ...navigationState,
      isSeekingOlderResult,
      navigateToNewerResult,
      navigateToOlderResult,
    },
    open: panel.open,
    triggerRef: panel.triggerRef,
  };
}

export function createChatRoomMessageSearchNavigationState({
  currentResultMessageId,
  hasNextPage,
  isError,
  messages,
}: Readonly<{
  currentResultMessageId: string | null;
  hasNextPage: boolean;
  isError: boolean;
  messages: readonly Pick<ChatMessage, "messageId">[];
}>): ChatRoomMessageSearchNavigationState {
  const currentResultIndex =
    currentResultMessageId === null
      ? null
      : messages.findIndex((message) => message.messageId === currentResultMessageId);
  const normalizedCurrentResultIndex =
    currentResultIndex === null || currentResultIndex < 0 ? null : currentResultIndex;

  return {
    canNavigateNewer: normalizedCurrentResultIndex !== null && normalizedCurrentResultIndex > 0,
    canNavigateOlder:
      normalizedCurrentResultIndex !== null &&
      (normalizedCurrentResultIndex < messages.length - 1 || (hasNextPage && !isError)),
    currentResultIndex: normalizedCurrentResultIndex,
  };
}

export function closeChatRoomMessageSearchExperience({
  clearSearch,
  closeDialog,
}: ChatRoomMessageSearchCloseActions): void {
  clearSearch();
  closeDialog();
}

// 연결이 끊기거나 다른 탭·기기에 사용권을 넘긴 동안에는 검색을 유지하고 돌아오면 이어서 씀
// 이동한 대화도 이때 유지되므로 검색만 닫히면 보던 결과 사이를 이동할 수 없게 됨
// 연결 오류는 자동 재연결 중 시도마다 잠깐 거치는 상태라 닫는 기준에 넣지 않고 방이 종료됐을 때만 닫음
export function shouldCloseChatRoomMessageSearchExperience(
  isOpen: boolean,
  sessionKind: ChatRoomSessionView["kind"],
): boolean {
  return isOpen && sessionKind === "closed";
}
