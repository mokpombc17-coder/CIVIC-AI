import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ChatMessageViewportNewerHistory = Readonly<{
  handleViewportChanged: () => void;
  isLoadingNewer: boolean;
  loadError: string | null;
  loadNewerMessages: () => Promise<void>;
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

  const loadNewerMessages = useCallback(async () => {
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
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "다음 메시지를 불러오지 못했습니다.";
}
