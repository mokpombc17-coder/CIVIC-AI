"use client";

import { useMutation } from "@tanstack/react-query";
import { consentApi } from "./consent-api";
import type { AcceptSensitiveSurveyConsentRequest } from "./consent-contracts";

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
