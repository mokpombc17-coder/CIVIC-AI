import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createRagProxy } from "./rag-client";

vi.mock("server-only", () => ({}));

describe("RAG BFF", () => {
  it("forwards the same opaque access token and browser metadata to RAG", async () => {
    let upstreamHeaders = new Headers();
    const requestBackend = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("http://rag.internal:8000/internal/v1/rag/queries");
      upstreamHeaders = new Headers(init?.headers);
      return Response.json({ job_id: "job-1", status: "QUEUED" }, { status: 202 });
    });
    const proxy = createRagProxy({
      browserOrigin: "https://civic.example",
      ragUrl: new URL("http://rag.internal:8000"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/rag/queries", {
        method: "POST",
        headers: {
          cookie: "civic_ai_access_token=opaque-token; unrelated=must-not-forward",
          "content-type": "application/json",
          "idempotency-key": "query-1",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ question: "질문" }),
      }),
      "/internal/v1/rag/queries",
      "rag:queries:write",
    );

    expect(response.status).toBe(202);
    expect(upstreamHeaders.get("authorization")).toBe("Bearer opaque-token");
    expect(upstreamHeaders.get("cookie")).toBe("civic_ai_access_token=opaque-token");
    expect(upstreamHeaders.get("origin")).toBe("https://civic.example");
    expect(upstreamHeaders.get("sec-fetch-site")).toBe("same-origin");
    expect(upstreamHeaders.get("idempotency-key")).toBe("query-1");
  });

  it("streams upload bodies without buffering", async () => {
    let upstreamBody: BodyInit | null | undefined;
    const requestBackend = vi.fn<typeof fetch>(async (_input, init) => {
      upstreamBody = init?.body;
      expect(new Headers(init?.headers).get("cookie")).toBe("civic_ai_access_token=opaque-token");
      return new Response(null, { status: 204 });
    });
    const proxy = createRagProxy({
      browserOrigin: "https://civic.example",
      ragUrl: new URL("http://rag.internal:8000"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/rag/uploads/upload-1/parts/1", {
        method: "PUT",
        headers: {
          cookie: "civic_ai_access_token=opaque-token",
          "content-type": "application/octet-stream",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
        },
        body: new Uint8Array([1, 2, 3]),
      }),
      "/internal/v1/rag/uploads/upload-1/parts/1",
      "rag:documents:write",
    );
    expect(response.status).toBe(204);
    expect(upstreamBody).toBeInstanceOf(ReadableStream);
  });

  it("rejects missing credentials before contacting RAG", async () => {
    const requestBackend = vi.fn<typeof fetch>();
    const proxy = createRagProxy({
      browserOrigin: "https://civic.example",
      ragUrl: new URL("http://rag.internal:8000"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/rag/folders"),
      "/internal/v1/rag/folders",
      "rag:documents:read",
    );
    expect(response.status).toBe(401);
    expect(requestBackend).not.toHaveBeenCalled();
  });
});
