import { describe, expect, it, vi } from "vitest";
import { downloadAndSaveRoomChatExport } from "./chat-room-export-operation";

describe("downloadAndSaveRoomChatExport", () => {
  it("API 결과를 별도 보관하지 않고 즉시 파일 저장 함수에 전달한다", async () => {
    const download = {
      blob: new Blob(["zip"], { type: "application/zip" }),
      exportId: "export-01",
      filename: "chat-export-export-01.zip",
      sha256: "a".repeat(64),
    };
    const api = { download: vi.fn(async () => download) };
    const save = vi.fn();

    await downloadAndSaveRoomChatExport({
      api,
      input: { roomId: "room-01", mode: "FULL" },
      save,
    });

    expect(api.download).toHaveBeenCalledWith({ roomId: "room-01", mode: "FULL" });
    expect(save).toHaveBeenCalledWith(download);
  });

  it("API 실패 시 파일 저장을 실행하지 않고 오류를 전달한다", async () => {
    const error = new TypeError("fetch failed");
    const api = {
      download: vi.fn(async () => {
        throw error;
      }),
    };
    const save = vi.fn();

    await expect(
      downloadAndSaveRoomChatExport({
        api,
        input: { roomId: "room-01", mode: "INCREMENTAL" },
        save,
      }),
    ).rejects.toBe(error);
    expect(save).not.toHaveBeenCalled();
  });
});
