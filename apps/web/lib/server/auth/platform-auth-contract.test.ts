import { describe, expect, it } from "vitest";
import {
  CHAT_AUDIT_EXPORT_SCOPE,
  PLATFORM_AUTH_SCOPE,
  PLATFORM_AUTH_SCOPES,
} from "./platform-auth-contract";

describe("platform-auth-contract", () => {
  it("감사 Export scope를 일반 사용자의 기본 scope와 분리한다", () => {
    expect(PLATFORM_AUTH_SCOPES).not.toContain(CHAT_AUDIT_EXPORT_SCOPE);
    expect(PLATFORM_AUTH_SCOPE.split(" ")).not.toContain(CHAT_AUDIT_EXPORT_SCOPE);
  });
});
