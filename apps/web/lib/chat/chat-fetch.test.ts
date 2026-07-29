import { describe, expect, it, vi } from "vitest";
import { ChatApiError, ChatResponseParseError, createChatFetch } from "./chat-fetch";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("chatFetch", () => {
  it("Chat API URL과 credential, 기본 header를 적용한다", async () => {
    const request = vi.fn<FetchRequest>(async () =>
      Response.json({ roomId: "room-1" }, { status: 200 }),
    );
    const chatFetch = createChatFetch({
      request,
    });

    const result = await chatFetch<{ roomId: string }>("/rooms/room-1");

    expect(result).toEqual({ roomId: "room-1" });
    expect(request).toHaveBeenCalledOnce();

    const [input, init] = request.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(input.toString()).toBe("http://localhost:8082/api/v1/rooms/room-1");
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("호출자가 전달한 request option과 header를 유지한다", async () => {
    const request = vi.fn<FetchRequest>(async () => new Response("created", { status: 201 }));
    const chatFetch = createChatFetch({
      baseUrl: "https://chat.example.com/api",
      request,
    });

    await chatFetch<string>("/rooms", {
      method: "POST",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/json",
        "Idempotency-Key": "command-1",
      },
      body: JSON.stringify({ title: "테스트 방" }),
      cache: "reload",
      credentials: "omit",
    });

    const [input, init] = request.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(input.toString()).toBe("https://chat.example.com/api/rooms");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ title: "테스트 방" }));
    expect(init?.cache).toBe("reload");
    expect(init?.credentials).toBe("include");
    expect(headers.get("Accept")).toBe("text/plain");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("command-1");
  });

  it("body가 없는 성공 응답을 undefined로 반환한다", async () => {
    const request = vi.fn<FetchRequest>(async () => new Response(null, { status: 204 }));
    const chatFetch = createChatFetch({ request });

    await expect(chatFetch<void>("/rooms/room-1")).resolves.toBeUndefined();
  });

  it("JSON 오류 응답을 ChatApiError로 변환한다", async () => {
    const request = vi.fn<FetchRequest>(
      async () =>
        new Response(
          JSON.stringify({
            type: "urn:hamcheeze:problem:invalid-request",
            title: "Invalid room API request",
            status: 400,
            detail: "Room not found.",
            instance: "/api/v1/rooms/missing",
            code: "INVALID_REQUEST",
            replayed: false,
            retryable: false,
            fieldErrors: [
              {
                field: "visibility",
                message: "must not be null",
              },
            ],
          }),
          {
            status: 400,
            statusText: "Bad Request",
            headers: {
              "Content-Type": "application/problem+json",
            },
          },
        ),
    );
    const chatFetch = createChatFetch({ request });

    const error = await chatFetch("/rooms/missing").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ChatApiError);
    expect(error).toMatchObject({
      status: 400,
      statusText: "Bad Request",
      url: "http://localhost:8082/api/v1/rooms/missing",
      body: {
        type: "urn:hamcheeze:problem:invalid-request",
        detail: "Room not found.",
        code: "INVALID_REQUEST",
      },
      code: "INVALID_REQUEST",
      retryable: false,
      fieldErrors: [
        {
          field: "visibility",
          message: "must not be null",
        },
      ],
      message: "Chat API 요청에 실패했습니다. (HTTP 400 Bad Request): Room not found.",
    });
  });

  it("재시도 가능한 Problem Details 정보를 노출한다", () => {
    const error = new ChatApiError(
      503,
      "Service Unavailable",
      "http://localhost:8082/api/v1/rooms",
      {
        type: "urn:hamcheeze:problem:infrastructure-unavailable",
        title: "Chat infrastructure unavailable",
        status: 503,
        detail: "Please retry the command.",
        instance: "/api/v1/rooms",
        code: "INFRASTRUCTURE_UNAVAILABLE",
        replayed: false,
        retryable: true,
      },
    );

    expect(error).toMatchObject({
      status: 503,
      code: "INFRASTRUCTURE_UNAVAILABLE",
      retryable: true,
      fieldErrors: [],
    });
  });

  it("일반 JSON 오류를 Problem Details로 오인하지 않는다", () => {
    const error = new ChatApiError(500, "Internal Server Error", "http://localhost:8082", {
      detail: "Unexpected error.",
    });

    expect(error.problem).toBeUndefined();
    expect(error.code).toBeUndefined();
    expect(error.retryable).toBe(false);
    expect(error.fieldErrors).toEqual([]);
  });

  it("성공 응답의 JSON이 잘못되면 parsing 오류로 변환한다", async () => {
    const request = vi.fn<FetchRequest>(
      async () =>
        new Response("{broken", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
    );
    const chatFetch = createChatFetch({ request });

    const error = await chatFetch("/rooms").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ChatResponseParseError);
    expect(error).toMatchObject({
      status: 200,
      url: "http://localhost:8082/api/v1/rooms",
      message: "Chat API 응답 JSON을 해석하지 못했습니다. (HTTP 200)",
    });
  });

  it("외부 origin으로 이탈할 수 있는 path를 거부한다", async () => {
    const chatFetch = createChatFetch({
      request: vi.fn<FetchRequest>(),
    });

    await expect(chatFetch("https://evil.example.com/rooms")).rejects.toThrow(
      "Chat API path는 /로 시작하는 상대 경로여야 합니다.",
    );
    await expect(chatFetch("//evil.example.com/rooms")).rejects.toThrow(
      "Chat API path는 /로 시작하는 상대 경로여야 합니다.",
    );
  });
});
