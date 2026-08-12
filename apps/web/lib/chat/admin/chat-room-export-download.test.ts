import { describe, expect, it, vi } from "vitest";
import {
  saveChatRoomExport,
  type ChatRoomExportDownloadEnvironment,
} from "./chat-room-export-download";

describe("saveChatRoomExport", () => {
  it("Object URL로 파일을 저장한 뒤 anchor와 URL을 정리한다", () => {
    const anchor = {
      click: vi.fn(),
      download: "",
      hidden: false,
      href: "",
      remove: vi.fn(),
    };
    const environment: ChatRoomExportDownloadEnvironment = {
      appendAnchor: vi.fn(),
      createAnchor: () => anchor,
      createObjectUrl: vi.fn(() => "blob:chat-export"),
      revokeObjectUrl: vi.fn(),
    };
    const blob = new Blob(["zip"], { type: "application/zip" });

    saveChatRoomExport({ blob, filename: "chat-export-export-01.zip" }, environment);

    expect(environment.createObjectUrl).toHaveBeenCalledWith(blob);
    expect(anchor).toMatchObject({
      download: "chat-export-export-01.zip",
      hidden: true,
      href: "blob:chat-export",
    });
    expect(environment.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(environment.revokeObjectUrl).toHaveBeenCalledWith("blob:chat-export");
  });

  it("클릭이 실패해도 anchor와 Object URL을 정리한다", () => {
    const anchor = {
      click: vi.fn(() => {
        throw new Error("download failed");
      }),
      download: "",
      hidden: false,
      href: "",
      remove: vi.fn(),
    };
    const environment: ChatRoomExportDownloadEnvironment = {
      appendAnchor: vi.fn(),
      createAnchor: () => anchor,
      createObjectUrl: vi.fn(() => "blob:chat-export"),
      revokeObjectUrl: vi.fn(),
    };

    expect(() =>
      saveChatRoomExport({ blob: new Blob(), filename: "chat-export-download.zip" }, environment),
    ).toThrow("download failed");
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(environment.revokeObjectUrl).toHaveBeenCalledWith("blob:chat-export");
  });
});
