"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { surveyApi } from "./survey-api";
import type { SubmitSurveyRequest, SurveySubmissionResponse } from "./survey-contracts";
import { VoteApiError } from "@/lib/vote/vote-fetch";

export const surveyQueryKeys = {
  all: ["vote", "surveys"] as const,
  current: () => [...surveyQueryKeys.all, "current"] as const,
  responses: () => [...surveyQueryKeys.all, "responses"] as const,
  responseList: () => [...surveyQueryKeys.responses(), "list"] as const,
  latestResponse: () => [...surveyQueryKeys.responses(), "latest"] as const,
  response: (responseId: string) => [...surveyQueryKeys.responses(), responseId] as const,
  eligibility: () => [...surveyQueryKeys.all, "eligibility"] as const,
};

export function useCurrentSurveyQuery() {
  return useQuery({
    queryKey: surveyQueryKeys.current(),
    queryFn: ({ signal }) => surveyApi.getCurrent(signal),
  });
}

export function useLatestSurveyResponseQuery(enabled = true) {
  return useQuery({
    queryKey: surveyQueryKeys.latestResponse(),
    queryFn: ({ signal }) => surveyApi.getLatestResponse(signal),
    enabled,
  });
}

export function useSurveyResponsesQuery(enabled = true) {
  return useQuery({
    queryKey: surveyQueryKeys.responseList(),
    queryFn: ({ signal }) => surveyApi.listResponses(signal),
    enabled,
  });
}

export function useSurveyResponseQuery(responseId: string, enabled = true) {
  return useQuery({
    queryKey: surveyQueryKeys.response(responseId),
    queryFn: ({ signal }) => surveyApi.getResponse(responseId, signal),
    enabled,
  });
}

export function useSurveyEligibilityQuery(enabled = true) {
  return useQuery({
    queryKey: surveyQueryKeys.eligibility(),
    queryFn: ({ signal }) => surveyApi.getEligibility(signal),
    enabled,
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
    onSuccess: (submission) => {
      void refreshSurveyAfterSubmission(queryClient, submission);
    },
    onError: (error) => {
      if (
        error instanceof VoteApiError &&
        (error.code === "CURRENT_SURVEY_ALREADY_SUBMITTED" ||
          error.code === "SURVEY_SUBMISSION_ROUND_CHANGED")
      ) {
        void queryClient.invalidateQueries({ queryKey: surveyQueryKeys.current() });
      }
    },
  });
}

async function refreshSurveyAfterSubmission(
  queryClient: QueryClient,
  submission: SurveySubmissionResponse,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: surveyQueryKeys.current() }),
    queryClient.invalidateQueries({ queryKey: surveyQueryKeys.latestResponse() }),
    queryClient.invalidateQueries({ queryKey: surveyQueryKeys.responseList() }),
    queryClient.invalidateQueries({ queryKey: surveyQueryKeys.eligibility() }),
    queryClient.invalidateQueries({ queryKey: surveyQueryKeys.response(submission.responseId) }),
  ]);
}
