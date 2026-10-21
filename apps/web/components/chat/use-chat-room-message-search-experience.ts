"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatRoomMessageSearchPanel } from "@/components/chat/use-chat-room-message-search-dialog";
import { useRoomMessageSearch } from "@/components/chat/use-room-message-search";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";

type ChatRoomMessageSearchExperienceOptions = Readonly<{
  generation: number;
  onNavigateToMessage: (messageId: string) => void;
  roomActive: boolean;
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
  { generation, onNavigateToMessage, roomActive }: ChatRoomMessageSearchExperienceOptions,
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
  const searchSessionKey = `${roomId}:${generation}:${sessionGeneration}`;
  const latestSearchSessionKeyRef = useRef(searchSessionKey);
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
    latestSearchSessionKeyRef.current = `closed:${searchSessionKey}`;
    closeChatRoomMessageSearchExperience({
      clearSearch,
      closeDialog,
    });
  }, [clearSearch, closeDialog, searchSessionKey]);
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
    const originMessageId = currentResultMessageId;
    setSeekingOlderSessionKey(requestedSessionKey);

    try {
      while (latestSearchSessionKeyRef.current === requestedSessionKey) {
        const result = await loadMore();

        if (latestSearchSessionKeyRef.current !== requestedSessionKey || result.isError) {
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
    searchSessionKey,
  ]);

  useEffect(() => {
    latestSearchSessionKeyRef.current = searchSessionKey;
  }, [searchSessionKey]);

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
    const pageLoadKey = `${searchSessionKey}:${loadedPageCount}`;

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
    searchSessionKey,
  ]);

  useEffect(() => {
    if (shouldCloseChatRoomMessageSearchExperience(panel.isOpen, roomActive)) {
      close();
    }
  }, [close, panel.isOpen, roomActive]);

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

export function shouldCloseChatRoomMessageSearchExperience(
  isOpen: boolean,
  roomActive: boolean,
): boolean {
  return isOpen && !roomActive;
}
