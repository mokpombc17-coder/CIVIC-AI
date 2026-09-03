"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serviceEligibilityQueryKey } from "@/lib/vote/service-eligibility";
import { surveyApi } from "./survey-api";
import type { SubmitSurveyRequest } from "./survey-contracts";

export const surveyQueryKeys = {
  all: ["vote", "survey"] as const,
  current: () => [...surveyQueryKeys.all, "current"] as const,
  history: () => [...surveyQueryKeys.all, "responses"] as const,
  latest: () => [...surveyQueryKeys.history(), "latest"] as const,
  response: (responseId: string) => [...surveyQueryKeys.history(), responseId] as const,
};

export function useCurrentSurveyQuery() {
  return useQuery({
    queryKey: surveyQueryKeys.current(),
    queryFn: ({ signal }) => surveyApi.getCurrent(signal),
  });
}

export function useLatestSurveyResponseQuery() {
  return useQuery({
    queryKey: surveyQueryKeys.latest(),
    queryFn: ({ signal }) => surveyApi.getLatest(signal),
  });
}

export function useSurveyResponseHistoryQuery() {
  return useQuery({
    queryKey: surveyQueryKeys.history(),
    queryFn: ({ signal }) => surveyApi.getHistory(signal),
  });
}

export function useSurveyResponseQuery(responseId: string) {
  return useQuery({
    queryKey: surveyQueryKeys.response(responseId),
    queryFn: ({ signal }) => surveyApi.getResponse(responseId, signal),
  });
}

export function useSubmitSurveyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      command,
      idempotencyKey,
    }: {
      command: SubmitSurveyRequest;
      idempotencyKey: string;
    }) => surveyApi.submit(command, idempotencyKey),
    onSuccess: async (result) => {
      if (!result.persisted) return;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: surveyQueryKeys.current(),
          refetchType: "none",
        }),
        queryClient.invalidateQueries({
          queryKey: surveyQueryKeys.latest(),
          refetchType: "none",
        }),
        queryClient.invalidateQueries({
          queryKey: surveyQueryKeys.history(),
          refetchType: "none",
        }),
        queryClient.invalidateQueries({
          queryKey: serviceEligibilityQueryKey,
          refetchType: "none",
        }),
      ]);
    },
  });
}
