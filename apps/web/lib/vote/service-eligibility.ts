"use client";

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { voteFetch, type VoteFetch } from "./vote-fetch";

const uuidSchema = z.string().uuid();

export const serviceEligibilitySchema = z.object({
  activeRoundId: uuidSchema.nullable(),
  capabilities: z.array(z.string()),
  eligible: z.boolean(),
  evaluatedAt: z.string().min(1),
  nextAction: z.string().nullable(),
  reason: z.string().nullable(),
  surveyRequirement: z.string().nullable(),
});

export type ServiceEligibility = z.infer<typeof serviceEligibilitySchema>;

export const serviceEligibilityQueryKey = ["vote", "service-eligibility"] as const;
export const serviceEligibilityStaleTimeMs = 5 * 60 * 1_000;

export type ServiceEligibilityApi = Readonly<{
  getCurrent(signal?: AbortSignal): Promise<ServiceEligibility>;
}>;

export function createServiceEligibilityApi(request: VoteFetch = voteFetch): ServiceEligibilityApi {
  return {
    async getCurrent(signal) {
      return serviceEligibilitySchema.parse(
        await request("/me/service-eligibility", signal ? { signal } : {}),
      );
    },
  };
}

export const serviceEligibilityApi = createServiceEligibilityApi();

export function getServiceEligibilityQueryOptions(
  api: ServiceEligibilityApi = serviceEligibilityApi,
) {
  return queryOptions({
    queryKey: serviceEligibilityQueryKey,
    queryFn: ({ signal }) => api.getCurrent(signal),
    staleTime: serviceEligibilityStaleTimeMs,
  });
}

export function requiresCurrentSurvey(eligibility: ServiceEligibility): boolean {
  return eligibility.eligible === false && eligibility.nextAction === "COMPLETE_CURRENT_SURVEY";
}
