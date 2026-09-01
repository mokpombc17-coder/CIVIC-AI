"use client";

import {
  currentSurveyResponseSchema,
  submitSurveyRequestSchema,
  surveyEligibilitySchema,
  surveyResponseDetailSchema,
  surveyResponseListSchema,
  surveySubmissionResponseSchema,
  surveyUuidSchema,
  type CurrentSurveyResponse,
  type SubmitSurveyRequest,
  type SurveyEligibility,
  type SurveyResponseDetail,
  type SurveyResponseSummary,
  type SurveySubmissionResponse,
} from "./survey-contracts";
import { voteFetch, type VoteFetch } from "@/lib/vote/vote-fetch";

export type SurveyApi = Readonly<{
  getCurrent(signal?: AbortSignal): Promise<CurrentSurveyResponse>;
  submit(
    command: SubmitSurveyRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SurveySubmissionResponse>;
  getLatestResponse(signal?: AbortSignal): Promise<SurveyResponseDetail>;
  listResponses(signal?: AbortSignal): Promise<SurveyResponseSummary[]>;
  getResponse(responseId: string, signal?: AbortSignal): Promise<SurveyResponseDetail>;
  getEligibility(signal?: AbortSignal): Promise<SurveyEligibility>;
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
      const key = surveyUuidSchema.parse(idempotencyKey);

      return surveySubmissionResponseSchema.parse(
        await request("/me/survey-responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(payload),
          ...(signal ? { signal } : {}),
        }),
      );
    },
    async getLatestResponse(signal) {
      return surveyResponseDetailSchema.parse(
        await request("/me/survey-responses/latest", signal ? { signal } : {}),
      );
    },
    async listResponses(signal) {
      return surveyResponseListSchema.parse(
        await request("/me/survey-responses", signal ? { signal } : {}),
      );
    },
    async getResponse(responseId, signal) {
      return surveyResponseDetailSchema.parse(
        await request(
          `/me/survey-responses/${surveyUuidSchema.parse(responseId)}`,
          signal ? { signal } : {},
        ),
      );
    },
    async getEligibility(signal) {
      return surveyEligibilitySchema.parse(
        await request("/me/service-eligibility", signal ? { signal } : {}),
      );
    },
  };
}

export const surveyApi = createSurveyApi();
