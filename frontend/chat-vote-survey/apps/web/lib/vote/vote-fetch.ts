"use client";

import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { VOTE_API_BASE_URL } from "./vote-config";
import { isVoteProblemDetails, type VoteProblemDetails } from "./vote-problem-details";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type VoteFetch = <TResponse = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<TResponse>;

export class VoteApiError extends Error {
  override readonly name = "VoteApiError";
  readonly problem: VoteProblemDetails | undefined;
  readonly code: string | undefined;
  readonly retryable: boolean;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(createHttpErrorMessage(status, statusText, body));
    this.problem = isVoteProblemDetails(body) ? body : undefined;
    this.code = this.problem?.code;
    this.retryable = this.problem?.retryable ?? false;
  }
}

// 로그인이 만료된 오류는 다시 시도해도 같은 결과라 다시 시도 대신 로그인으로 안내해야 함
export function isVoteAuthenticationRequired(error: unknown): boolean {
  return error instanceof VoteApiError && error.status === 401;
}

export class VoteResponseParseError extends Error {
  override readonly name = "VoteResponseParseError";

  constructor(
    readonly status: number,
    readonly url: string,
    options: ErrorOptions,
  ) {
    super(`Vote API 응답 JSON을 해석하지 못했습니다. (HTTP ${status})`, options);
  }
}

export function createVoteFetch({
  baseUrl = VOTE_API_BASE_URL,
  request = authenticatedFetch,
}: { baseUrl?: string; request?: FetchRequest } = {}): VoteFetch {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return async function voteFetch<TResponse>(path: string, init: RequestInit = {}) {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("Vote API path는 /로 시작하는 상대 경로여야 합니다.");
    }

    const url = new URL(path.slice(1), normalizedBaseUrl);
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const response = await request(url, {
      ...init,
      headers,
      credentials: "include",
      cache: init.cache ?? "no-store",
    });
    const body = await readResponseBody(response, url);

    if (!response.ok) {
      throw new VoteApiError(response.status, response.statusText, url.toString(), body);
    }

    return body as TResponse;
  };
}

export const voteFetch = createVoteFetch();

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Vote API base URL은 http 또는 https URL이어야 합니다.");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

async function readResponseBody(response: Response, requestUrl: URL): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (text.length === 0) return undefined;
  if (!response.headers.get("Content-Type")?.toLowerCase().includes("json")) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    if (!response.ok) return text;
    throw new VoteResponseParseError(response.status, requestUrl.toString(), { cause });
  }
}

function createHttpErrorMessage(status: number, statusText: string, body: unknown): string {
  const detail = isVoteProblemDetails(body) ? body.detail : undefined;
  const statusLabel = statusText ? `${status} ${statusText}` : String(status);
  return detail
    ? `Vote API 요청에 실패했습니다. (HTTP ${statusLabel}): ${detail}`
    : `Vote API 요청에 실패했습니다. (HTTP ${statusLabel})`;
}
