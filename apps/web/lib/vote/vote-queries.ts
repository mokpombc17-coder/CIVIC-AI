"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isNativeShell, subscribeNativeMessages } from "@/lib/native/bridge-client";
import { createVoteCompletedApi, getVoteCompletedApiMode } from "./vote-completed-api";
import { VoteApiError } from "./vote-fetch";
import { createVoteTaskApiAdapter } from "./vote-task-mock-api";
import { voteTaskSearchApi } from "./vote-task-search-api";
import type {
  SubmitTaskRequest,
  TaskPredictionView,
  TaskSubmissionResponse,
  UserTaskSummary,
} from "./vote-task-contracts";

const completedApiMode = getVoteCompletedApiMode();
const completedApi = createVoteCompletedApi(completedApiMode);
const voteTaskApi = createVoteTaskApiAdapter();

export const voteCompletedApiAvailable = completedApiMode !== "unavailable";

export const voteQueryKeys = {
  all: ["vote"] as const,
  tasks: () => [...voteQueryKeys.all, "tasks"] as const,
  openTasks: () => [...voteQueryKeys.tasks(), "open"] as const,
  taskSearches: () => [...voteQueryKeys.tasks(), "search"] as const,
  taskSearch: (query: string) => [...voteQueryKeys.taskSearches(), query] as const,
  details: () => [...voteQueryKeys.tasks(), "detail"] as const,
  detail: (taskId: string) => [...voteQueryKeys.details(), taskId] as const,
  predictions: () => [...voteQueryKeys.tasks(), "prediction"] as const,
  prediction: (taskId: string) => [...voteQueryKeys.predictions(), taskId] as const,
  submissions: () => [...voteQueryKeys.all, "submissions"] as const,
  submissionByTask: (taskId: string) => [...voteQueryKeys.submissions(), "task", taskId] as const,
  submission: (submissionId: string) =>
    [...voteQueryKeys.submissions(), "submission", submissionId] as const,
  completedTasks: () => [...voteQueryKeys.tasks(), "completed"] as const,
  results: () => [...voteQueryKeys.tasks(), "result"] as const,
  result: (taskId: string) => [...voteQueryKeys.results(), taskId] as const,
};

export function useOpenTasksQuery(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: voteQueryKeys.openTasks(),
    queryFn: ({ signal }) => voteTaskApi.getOpenTasks(signal),
    enabled,
    refetchInterval: (currentQuery) =>
      getOpenTasksPollingInterval(currentQuery.state.data, currentQuery.state.error, Date.now()),
  });

  useEffect(() => {
    if (!enabled || !isNativeShell()) return;

    // 앱 WebView는 백그라운드에서 돌아와도 visibilitychange를 보내지 않을 수 있어, 앱이 알려 주는 복귀 신호로도 다시 조회함
    return subscribeNativeMessages((message) => {
      if (message.type !== "APP_STATE_CHANGED" || message.payload.state !== "active") return;

      void queryClient.invalidateQueries(
        { queryKey: voteQueryKeys.openTasks() },
        { cancelRefetch: false },
      );
    });
  }, [enabled, queryClient]);

  return query;
}

export function useTaskSearchQuery(query: string, size = 20, enabled = true) {
  return useInfiniteQuery({
    queryKey: voteQueryKeys.taskSearch(query),
    queryFn: ({ pageParam, signal }) =>
      voteTaskSearchApi.searchTasks(
        { query, ...(pageParam ? { cursor: pageParam } : {}), size },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && query.length > 0,
    refetchOnWindowFocus: true,
  });
}

export function useOpenTaskQuery(taskId: string) {
  return useQuery({
    queryKey: voteQueryKeys.detail(taskId),
    queryFn: ({ signal }) => voteTaskApi.getOpenTask(taskId, signal),
  });
}

export function useTaskPredictionCoordinator(taskId: string, enabled = true) {
  const queryClient = useQueryClient();
  const requestedTaskRef = useRef<string | null>(null);
  const predictionQuery = useQuery({
    queryKey: voteQueryKeys.prediction(taskId),
    queryFn: ({ signal }) => voteTaskApi.getTaskPrediction(taskId, signal),
    enabled,
    refetchInterval(query) {
      return getPredictionPollingInterval(
        query.state.data,
        query.state.dataUpdateCount,
        typeof document === "undefined" || document.visibilityState === "visible",
      );
    },
    refetchOnWindowFocus: true,
  });
  const ensureMutation = useMutation({
    mutationFn: () => voteTaskApi.ensureTaskPrediction(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: voteQueryKeys.prediction(taskId) });
    },
  });

  useEffect(() => {
    const view = predictionQuery.data;
    if (
      !enabled ||
      !view?.predictionRequestAllowed ||
      requestedTaskRef.current === taskId ||
      ensureMutation.isPending
    ) {
      return;
    }
    requestedTaskRef.current = taskId;
    ensureMutation.mutate();
  }, [enabled, ensureMutation, predictionQuery.data, taskId]);

  return { predictionQuery, ensureMutation };
}

export function useTaskSubmissionQuery(taskId: string, enabled = true) {
  return useQuery({
    queryKey: voteQueryKeys.submissionByTask(taskId),
    queryFn: ({ signal }) => voteTaskApi.getTaskSubmissionByTask(taskId, signal),
    enabled,
  });
}

export function useSubmitTaskMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      command,
      idempotencyKey,
    }: {
      command: SubmitTaskRequest;
      idempotencyKey: string;
    }) => voteTaskApi.submitTask(taskId, command, idempotencyKey),
    onSuccess: (submission: TaskSubmissionResponse) => {
      void refreshTaskAfterSubmission(queryClient, taskId, submission.submissionId);
    },
  });
}

export function useCompletedTasksQuery(size = 20, enabled = true) {
  return useInfiniteQuery({
    queryKey: voteQueryKeys.completedTasks(),
    queryFn: ({ pageParam, signal }) =>
      completedApi.listCompletedTasks(
        { ...(pageParam ? { cursor: pageParam } : {}), size },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && voteCompletedApiAvailable,
    refetchOnWindowFocus: true,
  });
}

export function useTaskResultQuery(taskId: string) {
  return useQuery({
    queryKey: voteQueryKeys.result(taskId),
    queryFn: ({ signal }) => completedApi.getTaskResult(taskId, signal),
    enabled: voteCompletedApiAvailable,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function flattenCompletedTaskPages<TItem extends { taskId: string }>(
  pages: readonly { items: readonly TItem[] }[] | undefined,
): TItem[] {
  const seen = new Set<string>();
  return (
    pages?.flatMap((page) =>
      page.items.filter((item) => {
        if (seen.has(item.taskId)) return false;
        seen.add(item.taskId);
        return true;
      }),
    ) ?? []
  );
}

const OPEN_TASKS_POLLING_INTERVAL_MS = 60_000;
const OPEN_TASKS_FAILED_POLLING_INTERVAL_MS = 300_000;
// 서버와 기기의 시계가 조금 달라도 마감이 반영된 뒤에 조회하도록 마감 시각보다 조금 늦게 조회함
const OPEN_TASK_CLOSE_REFETCH_DELAY_MS = 2_000;

/**
 * 진행 중 투표 목록을 켜 둔 채 기다리는 사용자에게 새 투표와 마감을 보여 주려고 화면이 보이는 동안 주기적으로 조회함.
 * 가장 가까운 마감이 주기보다 먼저 오면 마감 직후에 조회하고, 조회가 실패하면 서버 부담을 줄이려고 간격을 늘림.
 */
export function getOpenTasksPollingInterval(
  tasks: readonly Pick<UserTaskSummary, "closesAt">[] | undefined,
  error: unknown,
  now: number,
): number | false {
  if (error instanceof VoteApiError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  if (error) return OPEN_TASKS_FAILED_POLLING_INTERVAL_MS;

  const nextRefetchAt = (tasks ?? [])
    .map((task) => Date.parse(task.closesAt) + OPEN_TASK_CLOSE_REFETCH_DELAY_MS)
    .filter((refetchAt) => refetchAt > now)
    .reduce((earliest, refetchAt) => Math.min(earliest, refetchAt), Number.POSITIVE_INFINITY);

  return Math.min(OPEN_TASKS_POLLING_INTERVAL_MS, nextRefetchAt - now);
}

export function getPredictionPollingInterval(
  view: Pick<TaskPredictionView, "state" | "waiting"> | undefined,
  updateCount: number,
  isPageVisible: boolean,
): number | false {
  if (!isPageVisible || !view || (!view.waiting && view.state !== "PERSONA_NOT_READY"))
    return false;
  if (updateCount <= 1) return 1_000;
  if (updateCount === 2) return 2_000;
  return 5_000;
}

async function refreshTaskAfterSubmission(
  queryClient: QueryClient,
  taskId: string,
  submissionId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.openTasks() }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.taskSearches() }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.detail(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.prediction(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.submissionByTask(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.submission(submissionId) }),
  ]);
}
