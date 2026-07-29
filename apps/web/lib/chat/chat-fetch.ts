"use client";

import { CHAT_API_BASE_URL } from "./chat-config";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CreateChatFetchOptions = {
  baseUrl?: string;
  request?: FetchRequest;
};

export type ChatFetch = <TResponse = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<TResponse>;

export class ChatApiError extends Error {
  override readonly name = "ChatApiError";

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(createHttpErrorMessage(status, statusText, body));
  }
}

export class ChatResponseParseError extends Error {
  override readonly name = "ChatResponseParseError";

  constructor(
    readonly status: number,
    readonly url: string,
    options: ErrorOptions,
  ) {
    super(`Chat API 응답 JSON을 해석하지 못했습니다. (HTTP ${status})`, options);
  }
}

export function createChatFetch({
  baseUrl = CHAT_API_BASE_URL,
  request = fetch,
}: CreateChatFetchOptions = {}): ChatFetch {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return async function chatFetch<TResponse>(
    path: string,
    init: RequestInit = {},
  ): Promise<TResponse> {
    const url = resolveChatApiUrl(normalizedBaseUrl, path);
    const headers = new Headers(init.headers);

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    const response = await request(url, {
      ...init,
      headers,
      credentials: "include",
      cache: init.cache ?? "no-store",
    });
    const body = await readResponseBody(response, url);

    if (!response.ok) {
      throw new ChatApiError(response.status, response.statusText, url.toString(), body);
    }

    return body as TResponse;
  };
}

export const chatFetch = createChatFetch();

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Chat API base URL은 http 또는 https URL이어야 합니다.");
  }

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;

  return url;
}

function resolveChatApiUrl(baseUrl: URL, path: string): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("Chat API path는 /로 시작하는 상대 경로여야 합니다.");
  }

  return new URL(path.slice(1), baseUrl);
}

async function readResponseBody(response: Response, requestUrl: URL): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get("Content-Type")?.toLowerCase();
  if (!contentType?.includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    if (!response.ok) {
      return text;
    }

    throw new ChatResponseParseError(response.status, requestUrl.toString(), {
      cause,
    });
  }
}

function createHttpErrorMessage(status: number, statusText: string, body: unknown): string {
  const detail = readErrorDetail(body);
  const statusLabel = statusText ? `${status} ${statusText}` : String(status);

  return detail
    ? `Chat API 요청에 실패했습니다. (HTTP ${statusLabel}): ${detail}`
    : `Chat API 요청에 실패했습니다. (HTTP ${statusLabel})`;
}

function readErrorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  for (const key of ["detail", "message", "error"] as const) {
    const value = Reflect.get(body, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}
