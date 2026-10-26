import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ChatMessageViewportNewerHistory = Readonly<{
  handleViewportChanged: () => void;
  isLoadingNewer: boolean;
  loadError: string | null;
  loadNewerMessages: () => Promise<void>;
  retryNewerMessages: () => Promise<void>;
}>;

export function useChatMessageViewportNewerHistory({
  canLoadNewer,
  onLoadNewer,
  viewportKey,
}: Readonly<{
  canLoadNewer: boolean;
  onLoadNewer: () => Promise<unknown>;
  viewportKey: string;
}>): ChatMessageViewportNewerHistory {
  const requestInFlightRef = useRef(false);
  const currentViewportKeyRef = useRef(viewportKey);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 응답이 오기 전에 다른 방이나 다른 검색 결과로 바뀌면 그 응답은 버려야 함
  // 요청 때의 viewportKey와 비교하려고 최신 값을 ref에 담음
  useLayoutEffect(() => {
    currentViewportKeyRef.current = viewportKey;
  });

  const requestNewerMessages = useCallback(async () => {
    if (requestInFlightRef.current || !canLoadNewer) {
      return;
    }

    const requestViewportKey = viewportKey;
    requestInFlightRef.current = true;
    setIsLoadingNewer(true);
    setLoadError(null);

    try {
      await onLoadNewer();
    } catch (error) {
      if (currentViewportKeyRef.current === requestViewportKey) {
        setLoadError(toErrorMessage(error));
      }
    } finally {
      if (currentViewportKeyRef.current === requestViewportKey) {
        requestInFlightRef.current = false;
        setIsLoadingNewer(false);
      }
    }
  }, [canLoadNewer, onLoadNewer, viewportKey]);

  // 실패한 뒤에는 스크롤로 다시 요청하지 않고 다시 시도 버튼으로만 요청함
  // 연결이 끊긴 동안 맨 아래에서 스크롤할 때마다 요청이 실패를 반복하고 안내가 깜빡이기 때문
  const loadNewerMessages = useCallback(async () => {
    if (loadError !== null) {
      return;
    }

    await requestNewerMessages();
  }, [loadError, requestNewerMessages]);

  // 재연결로 위치를 유지할 때도 실패 상태를 풀어 연결이 돌아오면 스크롤로 다시 불러올 수 있게 함
  const handleViewportChanged = useCallback(() => {
    requestInFlightRef.current = false;
    setIsLoadingNewer(false);
    setLoadError(null);
  }, []);

  return {
    handleViewportChanged,
    isLoadingNewer,
    loadError,
    loadNewerMessages,
    retryNewerMessages: requestNewerMessages,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "다음 메시지를 불러오지 못했습니다.";
}
