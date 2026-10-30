import { z } from "zod";
import { roomIdSchema } from "../chat-room-contracts";

export const chatRoomExportModeSchema = z.enum(["FULL", "INCREMENTAL"]);

export const chatRoomExportRequestSchema = z
  .object({
    mode: chatRoomExportModeSchema,
  })
  .strict();

export const chatRoomExportInputSchema = chatRoomExportRequestSchema
  .extend({
    roomId: roomIdSchema,
  })
  .strict();

export const chatRoomExportIdSchema = z.string().min(1);

export const chatRoomExportSha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Export SHA-256은 소문자 64자리 16진수여야 합니다.");

export const chatRoomExportProblemCodeSchema = z.enum([
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
]);

export type ChatRoomExportMode = z.infer<typeof chatRoomExportModeSchema>;
export type ChatRoomExportRequest = z.infer<typeof chatRoomExportRequestSchema>;
export type ChatRoomExportInput = z.infer<typeof chatRoomExportInputSchema>;
export type ChatRoomExportProblemCode = z.infer<typeof chatRoomExportProblemCodeSchema>;

/**
 * A successful Export is a ZIP response, not a JSON DTO. The API client creates
 * this value from the response body and headers without Zod-parsing the body.
 */
export type ChatRoomExportDownload = Readonly<{
  blob: Blob;
  exportId: string | null;
  filename: string;
  sha256: string | null;
}>;
