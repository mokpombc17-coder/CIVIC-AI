"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { consentApi } from "./consent-api";
import type { AcceptSensitiveSurveyConsentRequest } from "./consent-contracts";

export const consentQueryKeys = {
  all: ["consent"] as const,
  currentSensitiveSurveyDocument: () =>
    [...consentQueryKeys.all, "sensitive-survey", "current"] as const,
};

export function useCurrentSensitiveSurveyConsentDocumentQuery(enabled: boolean) {
  return useQuery({
    queryKey: consentQueryKeys.currentSensitiveSurveyDocument(),
    queryFn: ({ signal }) => consentApi.getCurrentSensitiveSurveyDocument(signal),
    enabled,
  });
}

export function useAcceptSensitiveSurveyConsentMutation() {
  return useMutation({
    mutationFn: ({
      command,
      idempotencyKey,
    }: {
      command: AcceptSensitiveSurveyConsentRequest;
      idempotencyKey: string;
    }) => consentApi.acceptSensitiveSurveyConsent(command, idempotencyKey),
  });
}
