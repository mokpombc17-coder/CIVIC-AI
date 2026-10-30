import { describe, expect, it } from "vitest";
import { mainAuthProxyPath } from "@/lib/api/main-auth-policy";

describe("Main/Auth proxy path", () => {
  it("Next.js가 디코딩한 opaque segment를 각각 다시 인코딩한다", () => {
    expect(mainAuthProxyPath(["admin", "users", "user B/2"])).toBe(
      "/api/v1/admin/users/user%20B%2F2",
    );
    expect(mainAuthProxyPath(["signup", "flows", "flow?part#1", "complete"])).toBe(
      "/api/v1/signup/flows/flow%3Fpart%231/complete",
    );
  });
});
