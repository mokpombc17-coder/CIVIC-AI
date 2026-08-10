"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageViewportInitialScrollTarget } from "./chat-message-viewport-state";
import {
  searchChatRoomEntryHistory,
  type ChatRoomEntryHistoryPageState,
  type ChatRoomEntryHistorySearchResult,
} from "../lib/chat/chat-room-entry-history-search";
import {
  resolveChatRoomEntryReadPosition,
  type ChatRoomEntryReadPositionSnapshot,
} from "../lib/chat/chat-room-entry-read-position";
import type { ChatRoomReadReceiptState } from "../lib/chat/chat-room-read-receipt-state";

export type ChatRoomEntryNavigationStatus = "pending" | "searching" | "ready" | "manual" | "error";

export type ChatRoomEntryNavigationRecovery = "continue" | "retry" | null;

export type ChatRoomEntryNavigationState = Readonly<{
  canReportReadState: boolean;
  initialScrollTarget: ChatMessageViewportInitialScrollTarget;
  key: string;
  readBoundaryAfterSequence: number | null;
  recovery: ChatRoomEntryNavigationRecovery;
  status: ChatRoomEntryNavigationStatus;
}>;

export type ChatRoomEntryNavigationController = ChatRoomEntryNavigationState &
  Readonly<{
    continueToReadPosition: () => void;
  }>;

type UseChatRoomEntryNavigationOptions = Readonly<{
  enabled: boolean;
  generation: number;
  history: ChatRoomEntryHistoryPageState;
  historyReady: boolean;
  latestConfirmedSequence: number | null;
  loadOlder: () => Promise<ChatRoomEntryHistoryPageState>;
  receiptState: ChatRoomReadReceiptState | undefined;
  receiptStateReady: boolean;
  receiptStateUnavailable: boolean;
  roomId: string;
  selfMembershipId: string | null;
}>;

export function useChatRoomEntryNavigation({
  enabled,
  generation,
  history,
  historyReady,
  latestConfirmedSequence,
  loadOlder,
  receiptState,
  receiptStateReady,
  receiptStateUnavailable,
  roomId,
  selfMembershipId,
}: UseChatRoomEntryNavigationOptions): ChatRoomEntryNavigationController {
  const key = `${roomId}:${generation}`;
  const currentKeyRef = useRef(key);
  const entryPositionRef = useRef<Extract<
    ChatRoomEntryReadPositionSnapshot,
    { mode: "restore" }
  > | null>(null);
  const mountedRef = useRef(false);
  const searchInFlightRef = useRef(false);
  const startedKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<ChatRoomEntryNavigationState>(() =>
    createPendingChatRoomEntryNavigationState(key),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentKeyRef.current = key;
    entryPositionRef.current = null;
    searchInFlightRef.current = false;
  }, [key]);

  useEffect(() => {
    if (!enabled || !historyReady) {
      return;
    }

    if (receiptStateUnavailable) {
      startedKeyRef.current = key;
      entryPositionRef.current = null;
      queueMicrotask(() => {
        if (!mountedRef.current || currentKeyRef.current !== key) {
          return;
        }

        setState((current) =>
          current.key === key && current.status === "error"
            ? current
            : createFallbackChatRoomEntryNavigationState(key, true),
        );
      });
      return;
    }

    if (!receiptStateReady || startedKeyRef.current === key) {
      return;
    }

    const entryPosition = resolveChatRoomEntryReadPosition({
      generation,
      latestConfirmedSequence,
      receiptState,
      receiptStateReady,
      roomId,
      selfMembershipId,
    });

    if (entryPosition.mode === "unavailable") {
      return;
    }

    startedKeyRef.current = key;
    entryPositionRef.current = entryPosition.mode === "restore" ? entryPosition : null;
    const initialState = createChatRoomEntryNavigationState(entryPosition);
    queueMicrotask(() => {
      if (mountedRef.current && currentKeyRef.current === key) {
        setState(initialState);
      }
    });

    if (entryPosition.mode !== "restore") {
      return;
    }

    searchInFlightRef.current = true;
    void searchChatRoomEntryHistory({
      entryPosition,
      initialHistory: history,
      isCurrent: () => mountedRef.current && currentKeyRef.current === key,
      loadOlder,
    }).then((result) => {
      if (!mountedRef.current || currentKeyRef.current !== key) {
        return;
      }

      setState(createChatRoomEntryNavigationState(entryPosition, result));
      searchInFlightRef.current = false;
    });
  }, [
    enabled,
    generation,
    history,
    historyReady,
    key,
    latestConfirmedSequence,
    loadOlder,
    receiptState,
    receiptStateReady,
    receiptStateUnavailable,
    roomId,
    selfMembershipId,
  ]);

  const continueToReadPosition = useCallback(() => {
    const entryPosition = entryPositionRef.current;

    if (
      state.key !== key ||
      state.recovery === null ||
      entryPosition === null ||
      searchInFlightRef.current
    ) {
      return;
    }

    searchInFlightRef.current = true;
    setState(createChatRoomEntryNavigationState(entryPosition));
    void searchChatRoomEntryHistory({
      entryPosition,
      initialHistory: history,
      isCurrent: () => mountedRef.current && currentKeyRef.current === key,
      loadOlder,
    }).then((result) => {
      if (!mountedRef.current || currentKeyRef.current !== key) {
        return;
      }

      searchInFlightRef.current = false;
      setState(createChatRoomEntryNavigationState(entryPosition, result));
    });
  }, [history, key, loadOlder, state.key, state.recovery]);

  const visibleState = state.key === key ? state : createPendingChatRoomEntryNavigationState(key);
  return {
    ...visibleState,
    continueToReadPosition,
  };
}

export function createChatRoomEntryNavigationState(
  entryPosition: Exclude<ChatRoomEntryReadPositionSnapshot, { mode: "unavailable" }>,
  searchResult?: ChatRoomEntryHistorySearchResult,
): ChatRoomEntryNavigationState {
  const key = `${entryPosition.roomId}:${entryPosition.generation}`;

  if (entryPosition.mode === "latest") {
    return Object.freeze({
      canReportReadState: true,
      initialScrollTarget: Object.freeze({ kind: "latest" }),
      key,
      readBoundaryAfterSequence: null,
      recovery: null,
      status: "ready",
    });
  }

  if (entryPosition.mode === "visibility-boundary") {
    return Object.freeze({
      canReportReadState: true,
      initialScrollTarget: Object.freeze({ kind: "first-message" }),
      key,
      readBoundaryAfterSequence: null,
      recovery: null,
      status: "ready",
    });
  }

  if (!searchResult) {
    return Object.freeze({
      canReportReadState: false,
      initialScrollTarget: Object.freeze({ kind: "pending" }),
      key,
      readBoundaryAfterSequence: null,
      recovery: null,
      status: "searching",
    });
  }

  if (searchResult.status === "found" || searchResult.status === "exhausted") {
    return Object.freeze({
      canReportReadState: true,
      initialScrollTarget: Object.freeze({
        afterSequence: entryPosition.dividerAfterSequence,
        kind: "read-boundary",
      }),
      key,
      readBoundaryAfterSequence: entryPosition.dividerAfterSequence,
      recovery: null,
      status: "ready",
    });
  }

  if (searchResult.status === "limit-reached") {
    return Object.freeze({
      canReportReadState: false,
      initialScrollTarget: Object.freeze({ kind: "pending" }),
      key,
      readBoundaryAfterSequence: null,
      recovery: "continue",
      status: "manual",
    });
  }

  if (searchResult.status === "stale") {
    return createPendingChatRoomEntryNavigationState(key);
  }

  return createFallbackChatRoomEntryNavigationState(key);
}

function createPendingChatRoomEntryNavigationState(key: string): ChatRoomEntryNavigationState {
  return Object.freeze({
    canReportReadState: false,
    initialScrollTarget: Object.freeze({ kind: "pending" }),
    key,
    readBoundaryAfterSequence: null,
    recovery: null,
    status: "pending",
  });
}

function createFallbackChatRoomEntryNavigationState(
  key: string,
  canReportReadState = false,
): ChatRoomEntryNavigationState {
  return Object.freeze({
    canReportReadState,
    initialScrollTarget: Object.freeze({ kind: canReportReadState ? "latest" : "pending" }),
    key,
    readBoundaryAfterSequence: null,
    recovery: canReportReadState ? null : "retry",
    status: "error",
  });
}
