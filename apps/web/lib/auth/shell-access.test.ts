import { describe, expect, it } from "vitest";
import { decideShellAccess, type CurrentUser } from "./shell-access";

const participant: CurrentUser = {
  userId: "participant-1",
  role: "PARTICIPANT",
  permissions: [],
  accountState: "ACTIVE",
  mustChangePassword: false,
};

const admin: CurrentUser = {
  userId: "admin-1",
  role: "ADMIN",
  permissions: ["RAG_ADMIN"],
  accountState: "ACTIVE",
  mustChangePassword: false,
};

describe("shell access decisions", () => {
  it("익명 또는 비활성 사용자의 참여자 화면 진입을 로그인으로 보낸다", () => {
    expect(decideShellAccess("PARTICIPANT", null)).toBe("REDIRECT_LOGIN");
    expect(decideShellAccess("PARTICIPANT", { ...participant, accountState: "INACTIVE" })).toBe(
      "REDIRECT_LOGIN",
    );
  });

  it("활성 참여자는 참여자 shell만 열 수 있다", () => {
    expect(decideShellAccess("PARTICIPANT", participant, "/home")).toBe("ALLOW");
    expect(decideShellAccess("ADMIN", participant)).toBe("FORBIDDEN");
  });

  it("비밀번호 변경이 필요한 사용자는 보안 화면만 열 수 있다", () => {
    const forced = { ...participant, mustChangePassword: true };
    expect(decideShellAccess("PARTICIPANT", forced, "/account/security")).toBe("ALLOW");
    expect(decideShellAccess("PARTICIPANT", forced, "/home")).toBe("FORBIDDEN");
    expect(decideShellAccess("PARTICIPANT", forced, "/rag?versionId=v1")).toBe("FORBIDDEN");
  });

  it("활성 관리자는 별도 참여자 shell로 전환할 수 있다", () => {
    expect(decideShellAccess("PARTICIPANT", admin)).toBe("ALLOW");
    expect(decideShellAccess("PARTICIPANT", { ...admin, role: "HIGHEST_ADMIN" })).toBe("ALLOW");
  });

  it("비밀번호 회전을 끝낸 활성 관리자만 관리자 shell을 연다", () => {
    expect(decideShellAccess("ADMIN", admin)).toBe("ALLOW");
    expect(decideShellAccess("HIGHEST_ADMIN", admin)).toBe("FORBIDDEN");
    expect(decideShellAccess("HIGHEST_ADMIN", { ...admin, role: "HIGHEST_ADMIN" })).toBe("ALLOW");
    expect(decideShellAccess("ADMIN", { ...admin, mustChangePassword: true })).toBe("FORBIDDEN");
  });

  it("운영 관리자는 부여받은 기능 권한의 화면만 열 수 있다", () => {
    const ragAdmin = { ...admin, permissions: ["RAG_ADMIN"] as const };
    expect(decideShellAccess("RAG_ADMIN", ragAdmin)).toBe("ALLOW");
    expect(decideShellAccess("CHAT_ADMIN", ragAdmin)).toBe("FORBIDDEN");
    expect(decideShellAccess("ADMIN", ragAdmin)).toBe("ALLOW");
    expect(decideShellAccess("RAG_ADMIN", participant)).toBe("FORBIDDEN");
  });
});
