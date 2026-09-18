import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nextRagSessionAdmission, RagSessionBoundary } from "./rag-session-boundary";
import { readRagSessionOwner } from "./rag-session-owner";

describe("RAG conversation owner verification", () => {
  const signal = new AbortController().signal;
  it("renders a blank content area before the current session is verified", () => {
    const markup = renderToStaticMarkup(
      <RagSessionBoundary ownerUserId="alice">
        <p>private conversation</p>
      </RagSessionBoundary>,
    );

    expect(markup).toBe("");
  });

  it.each([
    [false, "current", true],
    [true, "current", true],
    [false, "unavailable", false],
    [true, "unavailable", true],
    [true, "changed", false],
    [true, "expired", false],
  ] as const)("moves admission %s with %s to %s", (admitted, result, expected) => {
    expect(nextRagSessionAdmission(admitted, result)).toBe(expected);
  });

  it.each([
    [{ user_id: "alice", account_state: "ACTIVE" }, "current"],
    [{ user_id: "bob", account_state: "ACTIVE" }, "changed"],
    [{ user_id: "alice", account_state: "INACTIVE" }, "changed"],
    [{ user_id: "alice", account_state: "DELETED" }, "changed"],
    [{ user_id: "alice" }, "unavailable"],
    [null, "unavailable"],
  ])("classifies %j without trusting cached route identity", async (body, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    expect(await readRagSessionOwner("alice", signal, request)).toBe(expected);
    expect(request).toHaveBeenCalledWith("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  });
  it.each([401, 403, 409, 429, 503])(
    "keeps HTTP %s separate from account mismatch",
    async (status) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
      expect(await readRagSessionOwner("alice", signal, request)).toBe(
        status === 401 ? "expired" : "unavailable",
      );
    },
  );
  it("fails closed on network errors", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    expect(await readRagSessionOwner("alice", signal, request)).toBe("unavailable");
  });
});
