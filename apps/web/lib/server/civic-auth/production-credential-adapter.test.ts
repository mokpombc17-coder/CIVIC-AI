import { describe, expect, it, vi } from "vitest";
import {
  applyCivicProductionCredential,
  resolveCivicProductionCredential,
} from "./production-credential-adapter";

vi.mock("server-only", () => ({}));

describe("production credential adapter", () => {
  it("treats an incoming access-token cookie as opaque", async () => {
    await expect(
      resolveCivicProductionCredential({
        browserRequest: browserRequest({ cookie: "civic_ai_access_token=not-a-jwt" }),
        requestId: "request-1",
      }),
    ).resolves.toEqual({ token: "not-a-jwt", source: "incoming" });
  });

  it("accepts a Bearer token when no cookie is present", async () => {
    await expect(
      resolveCivicProductionCredential({
        browserRequest: browserRequest({ authorization: "Bearer api-client-token" }),
        requestId: "request-1",
      }),
    ).resolves.toEqual({ token: "api-client-token", source: "incoming" });
  });

  it("requires Cookie and Authorization credentials to be identical", async () => {
    await expect(
      resolveCivicProductionCredential({
        browserRequest: browserRequest({
          authorization: "Bearer header-token",
          cookie: "civic_ai_access_token=cookie-token",
        }),
        requestId: "request-1",
      }),
    ).rejects.toMatchObject({ status: 401, code: "CREDENTIAL_MISMATCH" });

    await expect(
      resolveCivicProductionCredential({
        browserRequest: browserRequest({
          authorization: "Bearer same-token",
          cookie: "civic_ai_access_token=same-token",
        }),
        requestId: "request-1",
      }),
    ).resolves.toEqual({ token: "same-token", source: "incoming" });
  });

  it("rejects malformed, duplicated, missing, and cross-origin credentials", async () => {
    for (const request of [
      browserRequest({ authorization: "Basic unexpected-token" }),
      browserRequest({ cookie: "civic_ai_access_token=one; civic_ai_access_token=two" }),
      browserRequest(),
    ]) {
      await expect(
        resolveCivicProductionCredential({ browserRequest: request, requestId: "request-1" }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      resolveCivicProductionCredential({
        browserRequest: browserRequest({ origin: "https://attacker.example" }),
        requestId: "request-1",
      }),
    ).rejects.toMatchObject({ status: 403, code: "ACCESS_DENIED" });
  });

  it("forwards one raw token through both Cookie and Authorization", () => {
    const headers = applyCivicProductionCredential(new Headers(), {
      token: "same-token",
      source: "incoming",
    });
    expect(headers.get("authorization")).toBe("Bearer same-token");
    expect(headers.get("cookie")).toBe("civic_ai_access_token=same-token");
  });
});

function browserRequest(
  headers: Readonly<{ authorization?: string; cookie?: string; origin?: string }> = {},
): Request {
  return new Request("https://civic.example/api/v1/rag/queries", { headers });
}
