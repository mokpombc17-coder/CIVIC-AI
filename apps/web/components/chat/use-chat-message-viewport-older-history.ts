import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  type ChatMessageViewportAnchor,
  captureChatMessageViewportAnchor,
} from "@/components/chat/chat-message-viewport-anchor";
import type {
  ChatMessageViewportPositionEvent,
  ChatMessageViewportPositionState,
} from "@/components/chat/chat-message-viewport-position";
import {
  createChatMessageOlderHistoryState,
  reduceChatMessageOlderHistory,
} from "@/components/chat/chat-message-viewport-state";
import type { ChatMessageViewportItemViewModel } from "@/components/chat/chat-room-view-model";

export type ChatMessageViewportOlderHistory = Readonly<{
  handleViewportChanged: (change: Readonly<{ preserved: boolean }>) => void;
  isLoadingOlder: boolean;
  loadError: string | null;
  loadOlderMessages: () => Promise<void>;
}>;

export function useChatMessageViewportOlderHistory({
  canLoadOlder,
  dispatchPosition,
  isHistoryLoadingOlder,
  items,
  onLoadOlder,
  pendingAnchorRef,
  scrollElementRef,
  viewportKey,
}: Readonly<{
  canLoadOlder: boolean;
  dispatchPosition: (event: ChatMessageViewportPositionEvent) => ChatMessageViewportPositionState;
  isHistoryLoadingOlder: boolean;
  items: readonly ChatMessageViewportItemViewModel[];
  onLoadOlder: () => Promise<Readonly<{ hasOlderMessages: boolean }>>;
  pendingAnchorRef: RefObject<ChatMessageViewportAnchor | null>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  viewportKey: string;
}>): ChatMessageViewportOlderHistory {
  const olderRequestInFlightRef = useRef(false);
  const currentViewportKeyRef = useRef(viewportKey);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(
    reduceChatMessageOlderHistory,
    canLoadOlder,
    createChatMessageOlderHistoryState,
  );

  // 과거 이력 응답을 기다리는 사이 다른 대화방이나 검색 위치로 바뀌면 늦게 온 응답을 버려야 함
  // 응답 시점의 화면을 알 수 있도록 최신 viewportKey를 ref에 담아 요청 때 값과 비교함
  useLayoutEffect(() => {
    currentViewportKeyRef.current = viewportKey;
  });

  const loadOlderMessages = useCallback(async () => {
    if (
      olderRequestInFlightRef.current ||
      !canLoadOlder ||
      isHistoryLoadingOlder ||
      state.status === "loading" ||
      state.status === "exhausted"
    ) {
      return;
    }

    const scrollElement = scrollElementRef.current;
    const anchor = scrollElement ? captureChatMessageViewportAnchor(scrollElement) : null;

    if (!anchor) {
      return;
    }

    const requestViewportKey = viewportKey;
    olderRequestInFlightRef.current = true;
    pendingAnchorRef.current = anchor;
    setLoadError(null);
    dispatch({ type: "load-older-started" });

    try {
      const result = await onLoadOlder();

      if (currentViewportKeyRef.current !== requestViewportKey) {
        return;
      }

      dispatch({
        type: "load-older-succeeded",
        hasOlderMessages: result.hasOlderMessages,
      });
    } catch (error) {
      if (currentViewportKeyRef.current !== requestViewportKey) {
        return;
      }

      pendingAnchorRef.current = null;
      setLoadError(toErrorMessage(error));
      dispatch({ type: "load-older-failed" });
    } finally {
      if (currentViewportKeyRef.current === requestViewportKey) {
        olderRequestInFlightRef.current = false;
      }
    }
  }, [
    canLoadOlder,
    isHistoryLoadingOlder,
    onLoadOlder,
    pendingAnchorRef,
    scrollElementRef,
    state.status,
    viewportKey,
  ]);

  const handleViewportChanged = useCallback(
    ({ preserved }: Readonly<{ preserved: boolean }>) => {
      olderRequestInFlightRef.current = false;
      pendingAnchorRef.current = null;

      if (preserved) {
        return;
      }

      setLoadError(null);
      dispatch({
        type: "reset",
        hasOlderMessages: canLoadOlder,
      });
    },
    [canLoadOlder, pendingAnchorRef],
  );

  useEffect(() => {
    dispatch({
      type: "older-availability-changed",
      hasOlderMessages: canLoadOlder,
    });
  }, [canLoadOlder]);

  useEffect(() => {
    const anchor = pendingAnchorRef.current;

    if (!anchor || anchor.viewportKey !== viewportKey) {
      return;
    }

    if (!items.some((item) => item.renderKey === anchor.renderKey)) {
      return;
    }

    dispatchPosition({ type: "older-anchor-rendered" });
  }, [dispatchPosition, items, pendingAnchorRef, viewportKey]);

  return {
    handleViewportChanged,
    isLoadingOlder: isHistoryLoadingOlder || state.status === "loading",
    loadError,
    loadOlderMessages,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.";
}
