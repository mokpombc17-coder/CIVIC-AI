import { describe, expect, it } from "vitest";
import { mainAuthProxyPath, matchMainAuthRoute } from "./main-auth-policy";

describe("Main/Auth proxy policy", () => {
  it("allows only the implemented Main/Auth methods", () => {
    expect(matchMainAuthRoute("POST", "/api/v1/auth/login")).toEqual({
      requiresCsrf: false,
    });
    expect(matchMainAuthRoute("POST", "/api/v1/auth/pwa/login")).toEqual({
      requiresCsrf: false,
    });
    expect(matchMainAuthRoute("POST", "/api/v1/auth/pwa/refresh")).toEqual({
      requiresCsrf: false,
    });
    expect(matchMainAuthRoute("POST", "/api/v1/auth/pwa/logout")).toEqual({
      requiresCsrf: false,
    });
    expect(matchMainAuthRoute("PATCH", "/api/v1/account/profile")).toEqual({
      requiresCsrf: true,
    });
    expect(matchMainAuthRoute("PUT", "/api/v1/admin/users/user-1/roles")).toEqual({
      requiresCsrf: true,
    });
    expect(matchMainAuthRoute("GET", "/api/v1/admin/privacy-operations/operation-1")).toEqual({
      requiresCsrf: false,
    });
  });

  it("rejects unknown paths and reports allowed methods", () => {
    expect(matchMainAuthRoute("GET", "/api/v1/auth/login")).toEqual({
      status: 405,
      allowedMethods: ["POST"],
    });
    expect(matchMainAuthRoute("POST", "/api/v1/oauth/google")).toEqual({ status: 404 });
  });

  it("encodes catch-all route segments", () => {
    expect(mainAuthProxyPath(["admin", "users", "한글 사용자"])).toBe(
      "/api/v1/admin/users/%ED%95%9C%EA%B8%80%20%EC%82%AC%EC%9A%A9%EC%9E%90",
    );
  });
});
