"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createVoteCompletedApi } from "./vote-completed-api";
import { createVoteTaskApiAdapter } from "./vote-task-mock-api";
import type {
  SubmitTaskRequest,
  TaskPredictionView,
  TaskSubmissionResponse,
} from "./vote-task-contracts";

const completedApi = createVoteCompletedApi();
const voteTaskApi = createVoteTaskApiAdapter();

export const voteQueryKeys = {
  all: ["vote"] as const,
  tasks: () => [...voteQueryKeys.all, "tasks"] as const,
  openTasks: () => [...voteQueryKeys.tasks(), "open"] as const,
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

export function useOpenTasksQuery() {
  return useQuery({
    queryKey: voteQueryKeys.openTasks(),
    queryFn: ({ signal }) => voteTaskApi.getOpenTasks(signal),
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

export function useCompletedTasksQuery(size = 20) {
  return useInfiniteQuery({
    queryKey: voteQueryKeys.completedTasks(),
    queryFn: ({ pageParam, signal }) =>
      completedApi.listCompletedTasks(
        { ...(pageParam ? { cursor: pageParam } : {}), size },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: true,
  });
}

export function useTaskResultQuery(taskId: string) {
  return useQuery({
    queryKey: voteQueryKeys.result(taskId),
    queryFn: ({ signal }) => completedApi.getTaskResult(taskId, signal),
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
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.detail(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.prediction(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.submissionByTask(taskId) }),
    queryClient.invalidateQueries({ queryKey: voteQueryKeys.submission(submissionId) }),
  ]);
}
