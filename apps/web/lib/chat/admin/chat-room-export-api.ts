"use client";

import { ChatApiError } from "../chat-fetch";
import {
  chatRoomExportIdSchema,
  chatRoomExportInputSchema,
  chatRoomExportSha256Schema,
  type ChatRoomExportDownload,
  type ChatRoomExportInput,
} from "./chat-room-export-contracts";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ChatRoomExportApi = Readonly<{
  download(input: ChatRoomExportInput): Promise<ChatRoomExportDownload>;
}>;

export class ChatRoomExportResponseError extends Error {
  override readonly name = "ChatRoomExportResponseError";

  constructor(message: string) {
    super(message);
  }
}

export function createChatRoomExportApi(request: FetchRequest = fetch): ChatRoomExportApi {
  return {
    async download(input) {
      const parsedInput = chatRoomExportInputSchema.parse(input);
      const path = `/api/chat/admin/rooms/${encodeURIComponent(parsedInput.roomId)}/exports`;
      const response = await request(path, {
        method: "POST",
        headers: {
          Accept: "application/zip",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: parsedInput.mode }),
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new ChatApiError(
          response.status,
          response.statusText,
          path,
          await readErrorBody(response),
        );
      }

      const contentType = response.headers.get("Content-Type") ?? "";

      if (!contentType.toLowerCase().includes("application/zip")) {
        throw new ChatRoomExportResponseError("채팅 Export 응답이 ZIP 형식이 아닙니다.");
      }

      const exportId = parseOptionalHeader(
        response.headers.get("X-Export-Id"),
        chatRoomExportIdSchema,
        "X-Export-Id",
      );
      const sha256 = parseOptionalHeader(
        response.headers.get("X-Export-SHA256"),
        chatRoomExportSha256Schema,
        "X-Export-SHA256",
      );
      const filename = resolveChatRoomExportFilename(
        response.headers.get("Content-Disposition"),
        exportId,
      );

      return {
        blob: await response.blob(),
        exportId,
        filename,
        sha256,
      };
    },
  };
}

export const chatRoomExportApi = createChatRoomExportApi();

export function resolveChatRoomExportFilename(
  contentDisposition: string | null,
  exportId: string | null,
): string {
  const headerFilename = /(?:^|;)\s*filename="([^"]+)"/i.exec(contentDisposition ?? "")?.[1];
  const safeHeaderFilename = headerFilename ? sanitizeFilename(headerFilename) : null;

  return safeHeaderFilename || `chat-export-${sanitizeFilename(exportId ?? "download")}.zip`;
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  if (!response.headers.get("Content-Type")?.toLowerCase().includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseOptionalHeader<T>(
  value: string | null,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  name: string,
): T | null {
  if (value === null) {
    return null;
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ChatRoomExportResponseError(`${name} 응답 헤더가 계약과 일치하지 않습니다.`);
  }

  return result.data;
}

function sanitizeFilename(value: string): string {
  const withoutPath = value.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return withoutPath.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}
