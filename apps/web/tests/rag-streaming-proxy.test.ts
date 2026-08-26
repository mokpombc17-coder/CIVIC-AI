import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRagProxy } from "@/lib/api/rag-client";

describe("RAG streaming BFF", () => {
  it("multipart part body를 upstream stream으로 전달한다", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("part-body"));
        controller.close();
      },
    });
    const incoming = {
      body,
      method: "PUT",
      url: "https://civic.example/api/v1/rag/uploads/upload-1/parts/1",
      headers: new Headers({
        cookie: "civic_ai_access_token=access-token",
        origin: "https://civic.example",
        "sec-fetch-site": "same-origin",
        "content-type": "application/octet-stream",
        "content-length": "9",
        "x-content-sha256": "a".repeat(64),
      }),
      nextUrl: new URL("https://civic.example/api/v1/rag/uploads/upload-1/parts/1"),
    } as NextRequest;
    const upstream: Array<RequestInit & { duplex?: "half" }> = [];
    const requestBackend = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      upstream.push(init as RequestInit & { duplex?: "half" });
      return new Response("decoded-response-body", {
        status: 200,
        headers: {
          "content-encoding": "gzip",
          "content-length": "4",
          "content-type": "text/plain",
        },
      });
    });
    const proxy = createRagProxy({
      ragUrl: new URL("http://rag-api:8000"),
      browserOrigin: "https://civic.example/rag/",
      requestBackend: requestBackend as typeof fetch,
    });

    const response = await proxy(
      incoming,
      "/internal/v1/rag/uploads/upload-1/parts/1",
      "rag:documents:write",
    );

    expect(upstream).toHaveLength(1);
    expect(upstream[0]?.body).toBe(body);
    expect(upstream[0]?.duplex).toBe("half");
    expect(new Headers(upstream[0]?.headers).get("content-length")).toBe("9");
    expect(response.headers.get("content-length")).toBeNull();
    await expect(response.text()).resolves.toBe("decoded-response-body");
  });

  it("SSE 재연결 식별자와 응답 헤더를 전달한다", async () => {
    const incoming = {
      body: null,
      method: "GET",
      headers: new Headers({
        cookie: "civic_ai_access_token=access-token",
        accept: "text/event-stream",
        "last-event-id": "7",
      }),
      nextUrl: new URL("https://civic.example/stream/rag/queries/job-1"),
    } as NextRequest;
    let upstreamHeaders = new Headers();
    const requestBackend = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      upstreamHeaders = new Headers(init?.headers);
      return new Response("id: 8\nevent: query.succeeded\ndata: {}\n\n", {
        headers: { "content-type": "text/event-stream", "x-accel-buffering": "no" },
      });
    });
    const proxy = createRagProxy({
      ragUrl: new URL("http://rag-api:8000"),
      browserOrigin: "https://civic.example",
      requestBackend: requestBackend as typeof fetch,
    });

    const response = await proxy(
      incoming,
      "/internal/v1/rag/queries/job-1/events",
      "rag:jobs:read",
    );
    expect(upstreamHeaders.get("last-event-id")).toBe("7");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });
});
