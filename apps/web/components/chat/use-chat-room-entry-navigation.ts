"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessageViewportInitialScrollTarget } from "./chat-message-viewport-state";
import type { ChatMessage } from "../../lib/chat/chat-room-contracts";
import {
  inspectChatRoomEntryHistory,
  type ChatRoomEntryHistoryPageState,
} from "../../lib/chat/chat-room-entry-history";
import {
  resolveChatRoomEntryReadPosition,
  type ChatRoomEntryReadPositionSnapshot,
} from "../../lib/chat/chat-room-entry-read-position";
import type { ChatRoomReadReceiptState } from "../../lib/chat/chat-room-read-receipt-state";

export type ChatRoomEntryNavigationStatus = "pending" | "jumping" | "ready" | "error";

export type ChatRoomEntryNavigationRecovery = "retry" | null;

export type ChatRoomEntryNavigationState = Readonly<{
  canReportReadState: boolean;
  initialScrollTarget: ChatMessageViewportInitialScrollTarget;
  jumpMessageId: string | null;
  key: string;
  readBoundaryAfterSequence: number | null;
  recovery: ChatRoomEntryNavigationRecovery;
  status: ChatRoomEntryNavigationStatus;
}>;

export type ChatRoomEntryNavigationController = ChatRoomEntryNavigationState &
  Readonly<{
    retryReadPosition: () => void;
  }>;

export type ChatRoomEntryJumpResult =
  | Readonly<{ status: "in-history" }>
  | Readonly<{ messageId: string; status: "jumped" }>
  | Readonly<{ status: "no-unread" }>
  | Readonly<{ status: "failed" }>;

type UseChatRoomEntryNavigationOptions = Readonly<{
  enabled: boolean;
  generation: number;
  history: ChatRoomEntryHistoryPageState;
  historyReady: boolean;
  latestConfirmedSequence: number | null;
  loadFirstUnreadMessage: (afterSequence: number) => Promise<ChatMessage | null>;
  onJumpToMessage: (messageId: string) => void;
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
  loadFirstUnreadMessage,
  onJumpToMessage,
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
  const jumpInFlightRef = useRef(false);
  const startedKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<ChatRoomEntryNavigationState>(() =>
    createPendingChatRoomEntryNavigationState(key),
  );
  const onJumpToMessageRef = useRef(onJumpToMessage);

  useLayoutEffect(() => {
    onJumpToMessageRef.current = onJumpToMessage;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentKeyRef.current = key;
    entryPositionRef.current = null;
    jumpInFlightRef.current = false;
  }, [key]);

  // 읽은 위치가 최신 페이지보다 이전이면 그 사이를 거슬러 불러오지 않고 첫 안 읽은 메시지를 바로 조회함
  // 거슬러 불러오면 안 읽은 메시지가 많을수록 오래 걸리고 여러 번 요청해야 함
  const jumpToFirstUnread = useCallback(
    (entryPosition: Extract<ChatRoomEntryReadPositionSnapshot, { mode: "restore" }>) => {
      const jumpKey = `${entryPosition.roomId}:${entryPosition.generation}`;
      jumpInFlightRef.current = true;

      void loadFirstUnreadMessage(entryPosition.dividerAfterSequence)
        .then(
          (message): ChatRoomEntryJumpResult =>
            message ? { messageId: message.messageId, status: "jumped" } : { status: "no-unread" },
          (): ChatRoomEntryJumpResult => ({ status: "failed" }),
        )
        .then((result) => {
          if (!mountedRef.current || currentKeyRef.current !== jumpKey) {
            return;
          }

          jumpInFlightRef.current = false;
          setState(createChatRoomEntryNavigationState(entryPosition, result));

          // 첫 안 읽은 메시지를 찾으면 진입 상태를 바꾸는 이 자리에서 바로 읽은 위치로 이동한 대화를 보여 줌
          // 나중에 하면 그 사이 최신 대화가 읽음 보고를 켠 채 남아 최신까지 읽음 처리될 수 있음
          if (result.status === "jumped") {
            onJumpToMessageRef.current(result.messageId);
          }
        });
    },
    [loadFirstUnreadMessage],
  );

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
            : createReceiptUnavailableChatRoomEntryNavigationState(key),
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
    const needsJump =
      entryPosition.mode === "restore" &&
      inspectChatRoomEntryHistory(history, entryPosition.dividerAfterSequence).status === "outside";
    const initialState = createChatRoomEntryNavigationState(
      entryPosition,
      entryPosition.mode === "restore" && !needsJump ? { status: "in-history" } : undefined,
    );
    queueMicrotask(() => {
      if (mountedRef.current && currentKeyRef.current === key) {
        setState(initialState);
      }
    });

    if (entryPosition.mode === "restore" && needsJump) {
      jumpToFirstUnread(entryPosition);
    }
  }, [
    enabled,
    generation,
    history,
    historyReady,
    jumpToFirstUnread,
    key,
    latestConfirmedSequence,
    receiptState,
    receiptStateReady,
    receiptStateUnavailable,
    roomId,
    selfMembershipId,
  ]);

  const retryReadPosition = useCallback(() => {
    const entryPosition = entryPositionRef.current;

    if (
      state.key !== key ||
      state.recovery === null ||
      entryPosition === null ||
      jumpInFlightRef.current
    ) {
      return;
    }

    setState(createChatRoomEntryNavigationState(entryPosition));
    jumpToFirstUnread(entryPosition);
  }, [jumpToFirstUnread, key, state.key, state.recovery]);

  const visibleState = state.key === key ? state : createPendingChatRoomEntryNavigationState(key);
  return {
    ...visibleState,
    retryReadPosition,
  };
}

export function createChatRoomEntryNavigationState(
  entryPosition: Exclude<ChatRoomEntryReadPositionSnapshot, { mode: "unavailable" }>,
  jumpResult?: ChatRoomEntryJumpResult,
): ChatRoomEntryNavigationState {
  const key = `${entryPosition.roomId}:${entryPosition.generation}`;

  if (entryPosition.mode === "latest") {
    return createLatestChatRoomEntryNavigationState(key);
  }

  if (entryPosition.mode === "visibility-boundary") {
    return Object.freeze({
      canReportReadState: true,
      initialScrollTarget: Object.freeze({ kind: "first-message" }),
      jumpMessageId: null,
      key,
      readBoundaryAfterSequence: null,
      recovery: null,
      status: "ready",
    });
  }

  if (!jumpResult) {
    return Object.freeze({
      canReportReadState: false,
      initialScrollTarget: Object.freeze({ kind: "pending" }),
      jumpMessageId: null,
      key,
      readBoundaryAfterSequence: null,
      recovery: null,
      status: "jumping",
    });
  }

  if (jumpResult.status === "in-history" || jumpResult.status === "jumped") {
    return Object.freeze({
      canReportReadState: true,
      initialScrollTarget: Object.freeze({
        afterSequence: entryPosition.dividerAfterSequence,
        kind: "read-boundary",
      }),
      jumpMessageId: jumpResult.status === "jumped" ? jumpResult.messageId : null,
      key,
      readBoundaryAfterSequence: entryPosition.dividerAfterSequence,
      recovery: null,
      status: "ready",
    });
  }

  if (jumpResult.status === "no-unread") {
    return createLatestChatRoomEntryNavigationState(key);
  }

  // 읽은 위치를 못 찾았을 때 최신 메시지를 보여 주되 다시 찾기 전까지는 읽은 위치를 서버에 저장하지 않음
  // 여기서 저장하면 사용자가 보지 않은 중간 메시지까지 읽은 것으로 남음
  return Object.freeze({
    canReportReadState: false,
    initialScrollTarget: Object.freeze({ kind: "latest" }),
    jumpMessageId: null,
    key,
    readBoundaryAfterSequence: null,
    recovery: "retry",
    status: "error",
  });
}

function createLatestChatRoomEntryNavigationState(key: string): ChatRoomEntryNavigationState {
  return Object.freeze({
    canReportReadState: true,
    initialScrollTarget: Object.freeze({ kind: "latest" }),
    jumpMessageId: null,
    key,
    readBoundaryAfterSequence: null,
    recovery: null,
    status: "ready",
  });
}

function createPendingChatRoomEntryNavigationState(key: string): ChatRoomEntryNavigationState {
  return Object.freeze({
    canReportReadState: false,
    initialScrollTarget: Object.freeze({ kind: "pending" }),
    jumpMessageId: null,
    key,
    readBoundaryAfterSequence: null,
    recovery: null,
    status: "pending",
  });
}

function createReceiptUnavailableChatRoomEntryNavigationState(
  key: string,
): ChatRoomEntryNavigationState {
  return Object.freeze({
    canReportReadState: true,
    initialScrollTarget: Object.freeze({ kind: "latest" }),
    jumpMessageId: null,
    key,
    readBoundaryAfterSequence: null,
    recovery: null,
    status: "error",
  });
}
