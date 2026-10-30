"use client";

import {
  currentSurveyResponseSchema,
  submissionResponseSchema,
  submitSurveyRequestSchema,
  surveyResponseDetailSchema,
  surveyResponseHistorySchema,
  type CurrentSurveyResponse,
  type SubmissionResponse,
  type SubmitSurveyRequest,
  type SurveyResponseDetail,
  type SurveyResponseSummary,
} from "./survey-contracts";
import { voteFetch, type VoteFetch } from "@/lib/vote/vote-fetch";

export type SurveyApi = Readonly<{
  getCurrent(signal?: AbortSignal): Promise<CurrentSurveyResponse>;
  submit(
    command: SubmitSurveyRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SubmissionResponse>;
  getLatest(signal?: AbortSignal): Promise<SurveyResponseDetail>;
  getHistory(signal?: AbortSignal): Promise<SurveyResponseSummary[]>;
  getResponse(responseId: string, signal?: AbortSignal): Promise<SurveyResponseDetail>;
}>;

export function createSurveyApi(request: VoteFetch = voteFetch): SurveyApi {
  return {
    async getCurrent(signal) {
      return currentSurveyResponseSchema.parse(
        await request("/me/surveys/current", signal ? { signal } : {}),
      );
    },
    async submit(command, idempotencyKey, signal) {
      const payload = submitSurveyRequestSchema.parse(command);
      const key = zUuid(idempotencyKey);
      return submissionResponseSchema.parse(
        await request("/me/survey-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify(payload),
          ...(signal ? { signal } : {}),
        }),
      );
    },
    async getLatest(signal) {
      return surveyResponseDetailSchema.parse(
        await request("/me/survey-responses/latest", signal ? { signal } : {}),
      );
    },
    async getHistory(signal) {
      return surveyResponseHistorySchema.parse(
        await request("/me/survey-responses", signal ? { signal } : {}),
      );
    },
    async getResponse(responseId, signal) {
      return surveyResponseDetailSchema.parse(
        await request(`/me/survey-responses/${zUuid(responseId)}`, signal ? { signal } : {}),
      );
    },
  };
}

function zUuid(value: string): string {
  return submitSurveyRequestSchema.shape.roundId.parse(value);
}

export const surveyApi = createSurveyApi();
