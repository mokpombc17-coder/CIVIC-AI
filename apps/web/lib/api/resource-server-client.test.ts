import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createResourceServerProxy } from "./resource-server-client";

vi.mock("server-only", () => ({}));

describe("admin resource server BFF", () => {
  it("forwards one opaque token as the matching Cookie and Authorization pair", async () => {
    let upstreamHeaders = new Headers();
    const requestBackend = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "http://chat.internal:8082/api/v1/admin/room-creation-requests?status=PENDING",
      );
      upstreamHeaders = new Headers(init?.headers);
      return Response.json({ items: [], nextCursor: null, hasNext: false });
    });
    const proxy = createResourceServerProxy({
      browserOrigin: "https://civic.example",
      resourceUrl: new URL("http://chat.internal:8082"),
      requestBackend,
    });

    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/admin/room-creation-requests?status=PENDING", {
        headers: {
          cookie: "civic_ai_access_token=opaque-token; unrelated=must-not-forward",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
        },
      }),
      "/api/v1/admin/room-creation-requests",
      "chat:rooms:approve",
    );

    expect(response.status).toBe(200);
    expect(upstreamHeaders.get("authorization")).toBe("Bearer opaque-token");
    expect(upstreamHeaders.get("cookie")).toBe("civic_ai_access_token=opaque-token");
    expect(upstreamHeaders.get("origin")).toBe("https://civic.example");
  });

  it("preserves result download and rate-limit response headers", async () => {
    const proxy = createResourceServerProxy({
      browserOrigin: "https://civic.example",
      resourceUrl: new URL("http://vote.internal:8083"),
      requestBackend: vi.fn<typeof fetch>(
        async () =>
          new Response('{"answer":"A"}\n', {
            headers: {
              "content-disposition": 'attachment; filename="task-result-view-v1.jsonl"',
              "content-type": "application/x-ndjson;charset=UTF-8",
              "retry-after": "7",
            },
          }),
      ),
    });
    const response = await proxy(
      authorizedRequest("https://civic.example/api/v1/admin/tasks/result"),
      "/api/v1/admin/tasks/7e85d865-4616-4cf5-967c-7d23c27dbf4c/result-view",
      "vote:tasks:admin",
    );

    expect(response.headers.get("content-disposition")).toContain("task-result-view-v1.jsonl");
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("retry-after")).toBe("7");
    expect(await response.text()).toContain('"answer":"A"');
  });

  it("rejects missing credentials and unsafe upstream paths before contact", async () => {
    const requestBackend = vi.fn<typeof fetch>();
    const proxy = createResourceServerProxy({
      browserOrigin: "https://civic.example",
      resourceUrl: new URL("http://vote.internal:8083"),
      requestBackend,
    });

    const missing = await proxy(
      new NextRequest("https://civic.example/api/v1/admin/tasks"),
      "/api/v1/admin/tasks",
      "vote:tasks:admin",
    );
    const unsafe = await proxy(
      authorizedRequest("https://civic.example/api/v1/admin/tasks"),
      "/api/v1/admin/../private",
      "vote:tasks:admin",
    );

    expect(missing.status).toBe(401);
    expect(unsafe.status).toBe(404);
    expect(requestBackend).not.toHaveBeenCalled();
  });
});

function authorizedRequest(url: string): NextRequest {
  return new NextRequest(url, {
    headers: {
      cookie: "civic_ai_access_token=opaque-token",
      origin: "https://civic.example",
      "sec-fetch-site": "same-origin",
    },
  });
}
