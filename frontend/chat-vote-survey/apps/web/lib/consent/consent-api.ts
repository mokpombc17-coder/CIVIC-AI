"use client";

import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  acceptSensitiveSurveyConsentRequestSchema,
  acceptSensitiveSurveyConsentResponseSchema,
  type AcceptSensitiveSurveyConsentRequest,
  type AcceptSensitiveSurveyConsentResponse,
} from "./consent-contracts";

const CONSENT_ACCEPTANCES_PATH = "/api/v1/me/consent-acceptances";

type ConsentRequest = (path: string, init?: RequestInit) => Promise<unknown>;

export type ConsentApi = Readonly<{
  acceptSensitiveSurveyConsent(
    command: AcceptSensitiveSurveyConsentRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<AcceptSensitiveSurveyConsentResponse>;
}>;

export class ConsentApiError extends Error {
  override readonly name = "ConsentApiError";

  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export function createConsentApi(request: ConsentRequest = consentRequest): ConsentApi {
  return {
    async acceptSensitiveSurveyConsent(command, idempotencyKey, signal) {
      const payload = acceptSensitiveSurveyConsentRequestSchema.parse(command);
      const key =
        acceptSensitiveSurveyConsentResponseSchema.shape.consentReceiptId.parse(idempotencyKey);
      return acceptSensitiveSurveyConsentResponseSchema.parse(
        await request(CONSENT_ACCEPTANCES_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify(payload),
          ...(signal ? { signal } : {}),
        }),
      );
    },
  };
}

async function consentRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await authenticatedFetch(path, {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "same-origin",
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    const problem = isRecord(body) ? body : undefined;
    const code = typeof problem?.code === "string" ? problem.code : undefined;
    const detail = typeof problem?.detail === "string" ? problem.detail : undefined;
    throw new ConsentApiError(
      response.status,
      code,
      detail ?? `민감정보 동의 API 요청에 실패했습니다. (HTTP ${response.status})`,
    );
  }

  return body;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (text.length === 0) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error("민감정보 동의 API 응답 JSON을 해석하지 못했습니다.", { cause });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const consentApi = createConsentApi();
