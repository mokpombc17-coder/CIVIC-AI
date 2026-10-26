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
  retryOlderMessages: () => Promise<void>;
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

  const requestOlderMessages = useCallback(async () => {
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

  // 실패한 뒤에는 스크롤로 다시 요청하지 않고 다시 시도 버튼으로만 요청함
  // 연결이 끊긴 동안 맨 위에서 스크롤할 때마다 요청이 실패를 반복하고 안내가 깜빡이기 때문
  const loadOlderMessages = useCallback(async () => {
    if (state.status === "error") {
      return;
    }

    await requestOlderMessages();
  }, [requestOlderMessages, state.status]);

  const handleViewportChanged = useCallback(
    ({ preserved }: Readonly<{ preserved: boolean }>) => {
      olderRequestInFlightRef.current = false;
      pendingAnchorRef.current = null;
      setLoadError(null);

      if (preserved) {
        // 같은 방에서 재연결되면 위치는 유지하지만 요청 때 viewportKey와 달라져 진행 중이던 응답은 버려짐
        // 상태를 loading에 남기면 다음 불러오기가 막히므로 진행 중인 요청을 취소한 것으로 정리함
        // 재연결은 연결이 돌아왔다는 뜻이므로 실패 상태도 풀어 스크롤로 다시 불러올 수 있게 함
        dispatch({
          type: "load-older-cancelled",
          hasOlderMessages: canLoadOlder,
        });
        return;
      }

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

    // 기준 메시지는 요청 전부터 목록에 있어서 응답을 기다리는 사이 실시간 메시지로 목록이 바뀌어도 복원이 시작될 수 있음
    // 그때 복원하면 기준이 지워져 이전 페이지가 붙을 때 화면이 튀므로 불러오기가 끝난 뒤에만 복원함
    if (isHistoryLoadingOlder || state.status === "loading") {
      return;
    }

    if (!items.some((item) => item.renderKey === anchor.renderKey)) {
      return;
    }

    dispatchPosition({ type: "older-anchor-rendered" });
  }, [dispatchPosition, isHistoryLoadingOlder, items, pendingAnchorRef, state.status, viewportKey]);

  return {
    handleViewportChanged,
    isLoadingOlder: isHistoryLoadingOlder || state.status === "loading",
    loadError,
    loadOlderMessages,
    retryOlderMessages: requestOlderMessages,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.";
}
