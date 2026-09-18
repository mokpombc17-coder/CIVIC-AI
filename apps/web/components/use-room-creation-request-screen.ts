"use client";

import { useMemo, useState } from "react";
import { useCancelRoomCreationRequestMutation } from "@/lib/chat/chat-room-mutations";
import { useMyRoomCreationRequestQuery } from "@/lib/chat/chat-room-queries";
import {
  executeRoomCreationRequestCancellation,
  getRoomCreationRequestCancellationErrorMessage,
} from "@/lib/chat/room-creation-request-cancellation";
import { createRoomCreationRequestErrorPresentation } from "@/lib/chat/room-creation-request-presentation";

export function useRoomCreationRequestScreen(creationRequestId: string) {
  const query = useMyRoomCreationRequestQuery(creationRequestId);
  const cancelMutation = useCancelRoomCreationRequestMutation();
  const [cancellationError, setCancellationError] = useState<unknown>(null);
  const [cancellationFeedback, setCancellationFeedback] = useState<string | null>(null);
  const errorPresentation = useMemo(
    () => (query.isError ? createRoomCreationRequestErrorPresentation(query.error) : null),
    [query.error, query.isError],
  );

  async function cancelRequest(): Promise<void> {
    if (query.data?.status !== "PENDING" || cancelMutation.isPending) {
      return;
    }

    if (!window.confirm("토론방 생성 신청을 취소할까요?")) {
      return;
    }

    setCancellationError(null);
    setCancellationFeedback(null);

    const result = await executeRoomCreationRequestCancellation({
      cancel: (requestId) => cancelMutation.mutateAsync(requestId),
      creationRequestId,
      refresh: async () => {
        const refreshResult = await query.refetch();

        if (refreshResult.error) {
          throw refreshResult.error;
        }

        if (!refreshResult.data) {
          throw new Error("신청의 최신 상태를 확인할 수 없습니다.");
        }

        return refreshResult.data;
      },
    });

    if (result.kind === "failed") {
      setCancellationError(result.error);
      return;
    }

    setCancellationFeedback(
      result.kind === "canceled"
        ? "토론방 생성 신청을 취소했습니다."
        : "다른 처리가 먼저 완료되어 최신 상태로 갱신했습니다.",
    );
  }

  return {
    cancel: () => void cancelRequest(),
    cancellationErrorMessage:
      cancellationError === null
        ? null
        : getRoomCreationRequestCancellationErrorMessage(cancellationError),
    cancellationFeedback,
    error: errorPresentation,
    isCanceling: cancelMutation.isPending,
    isPending: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    refresh: () => {
      setCancellationError(null);
      setCancellationFeedback(null);
      void query.refetch();
    },
    request: query.data ?? null,
  };
}
