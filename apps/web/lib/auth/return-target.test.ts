import { describe, expect, it } from "vitest";
import { safeAdminReturnTarget, safeReturnTarget } from "./return-target";

describe("safeReturnTarget", () => {
  it("preserves internal paths, queries, and fragments", () => {
    expect(safeReturnTarget("/rag?folderId=folder-1#answer")).toBe("/rag?folderId=folder-1#answer");
  });

  it("rejects external, ambiguous, recursive auth, and backslash targets", () => {
    for (const target of [
      "https://evil.example/rag",
      "//evil.example/rag",
      "/login",
      "/auth/refresh",
      "/admin\\users",
    ]) {
      expect(safeReturnTarget(target)).toBe("/home");
    }
  });
});

describe("safeAdminReturnTarget", () => {
  it("preserves admin paths and query strings", () => {
    expect(safeAdminReturnTarget("/admin/users/detail?userId=user-1")).toBe(
      "/admin/users/detail?userId=user-1",
    );
    expect(safeAdminReturnTarget("/admin/rag/jobs?jobId=job-1")).toBe(
      "/admin/rag/jobs?jobId=job-1",
    );
  });

  it("rejects external and non-admin return targets", () => {
    expect(safeAdminReturnTarget("https://evil.example/admin")).toBe("/admin");
    expect(safeAdminReturnTarget("//evil.example/admin")).toBe("/admin");
    expect(safeAdminReturnTarget("/rag")).toBe("/admin");
  });
});
