import { describe, expect, it } from "vitest";
import {
  chatRoomExportIdSchema,
  chatRoomExportInputSchema,
  chatRoomExportProblemCodeSchema,
  chatRoomExportRequestSchema,
  chatRoomExportSha256Schema,
} from "./chat-room-export-contracts";

describe("chat-room-export-contracts", () => {
  it.each(["FULL", "INCREMENTAL"] as const)("%s 요청을 허용한다", (mode) => {
    expect(chatRoomExportRequestSchema.parse({ mode })).toEqual({ mode });
    expect(chatRoomExportInputSchema.parse({ roomId: "room-01", mode })).toEqual({
      roomId: "room-01",
      mode,
    });
  });

  it("지원하지 않는 모드와 추가 요청 필드를 거절한다", () => {
    expect(chatRoomExportRequestSchema.safeParse({ mode: "full" }).success).toBe(false);
    expect(
      chatRoomExportRequestSchema.safeParse({ mode: "FULL", baseExportId: "export-01" }).success,
    ).toBe(false);
  });

  it("roomId를 기존 Room 계약으로 검증한다", () => {
    expect(chatRoomExportInputSchema.safeParse({ roomId: "../room", mode: "FULL" }).success).toBe(
      false,
    );
  });

  it("Export ID는 opaque non-blank 값으로 취급한다", () => {
    expect(chatRoomExportIdSchema.parse("export-01")).toBe("export-01");
    expect(chatRoomExportIdSchema.safeParse("").success).toBe(false);
  });

  it("SHA-256 응답 헤더는 소문자 64자리 16진수만 허용한다", () => {
    expect(chatRoomExportSha256Schema.parse("a".repeat(64))).toBe("a".repeat(64));
    expect(chatRoomExportSha256Schema.safeParse("A".repeat(64)).success).toBe(false);
    expect(chatRoomExportSha256Schema.safeParse("a".repeat(63)).success).toBe(false);
  });

  it.each([
    "INVALID_REQUEST",
    "UNAUTHENTICATED",
    "ACCESS_DENIED",
    "ROOM_NOT_FOUND",
    "CHAT_EXPORT_ALREADY_RUNNING",
    "CHAT_EXPORT_BASE_NOT_FOUND",
    "CHAT_EXPORT_TOO_LARGE",
    "CHAT_EXPORT_LEDGER_INCONSISTENT",
    "CHAT_EXPORT_UNAVAILABLE",
    "INTERNAL_ERROR",
  ] as const)("%s 오류 코드를 허용한다", (code) => {
    expect(chatRoomExportProblemCodeSchema.parse(code)).toBe(code);
  });
});
