import { describe, expect, it, vi } from "vitest";
import { ChatRoomExportController } from "./chat-room-export-controller";

const DOWNLOAD = {
  blob: new Blob(["zip"], { type: "application/zip" }),
  exportId: "export-01",
  filename: "chat-export-export-01.zip",
  sha256: "a".repeat(64),
} as const;

describe("ChatRoomExportController", () => {
  it("동일 controller에서 하나의 Export만 실행하고 성공한 ZIP을 즉시 저장한다", async () => {
    const deferred = createDeferred<typeof DOWNLOAD>();
    const api = { download: vi.fn(() => deferred.promise) };
    const save = vi.fn();
    const controller = new ChatRoomExportController({ api, roomId: "room-01", save });
    const full = controller.download("FULL");
    const duplicate = controller.download("INCREMENTAL");

    expect(api.download).toHaveBeenCalledOnce();
    expect(api.download).toHaveBeenCalledWith({ roomId: "room-01", mode: "FULL" });
    expect(controller.getSnapshot()).toEqual({
      activeMode: "FULL",
      error: null,
      failedMode: null,
    });

    await duplicate;
    deferred.resolve(DOWNLOAD);
    await full;

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(DOWNLOAD);
    expect(controller.getSnapshot()).toEqual({
      activeMode: null,
      error: null,
      failedMode: null,
    });
    expect(controller.getSnapshot()).not.toHaveProperty("blob");
  });

  it("retryable 실패의 mode를 보존하고 사용자 재시도 시 같은 mode로 다시 실행한다", async () => {
    const error = new TypeError("fetch failed");
    const api = {
      download: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(DOWNLOAD),
    };
    const save = vi.fn();
    const controller = new ChatRoomExportController({ api, roomId: "room-01", save });

    await controller.download("INCREMENTAL");

    expect(controller.getSnapshot()).toEqual({
      activeMode: null,
      error,
      failedMode: "INCREMENTAL",
    });

    await controller.retry();

    expect(api.download).toHaveBeenCalledTimes(2);
    expect(api.download).toHaveBeenLastCalledWith({
      roomId: "room-01",
      mode: "INCREMENTAL",
    });
    expect(save).toHaveBeenCalledWith(DOWNLOAD);
    expect(controller.getSnapshot()).toEqual({
      activeMode: null,
      error: null,
      failedMode: null,
    });
  });

  it("non-retryable 실패는 자동 또는 사용자 retry로 반복하지 않고 reset할 수 있다", async () => {
    const error = new Error("invalid response");
    const api = {
      download: vi.fn(async () => {
        throw error;
      }),
    };
    const controller = new ChatRoomExportController({
      api,
      roomId: "room-01",
      save: vi.fn(),
    });

    await controller.download("FULL");
    await controller.retry();

    expect(api.download).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ error, failedMode: "FULL" });

    controller.resetError();

    expect(controller.getSnapshot()).toEqual({
      activeMode: null,
      error: null,
      failedMode: null,
    });
  });

  it("dispose 이후 도착한 이전 Room 응답은 ZIP 저장과 상태 알림에 반영하지 않는다", async () => {
    const deferred = createDeferred<typeof DOWNLOAD>();
    const save = vi.fn();
    const listener = vi.fn();
    const controller = new ChatRoomExportController({
      api: { download: vi.fn(() => deferred.promise) },
      roomId: "room-old",
      save,
    });
    controller.subscribe(listener);
    const request = controller.download("FULL");

    expect(listener).toHaveBeenCalledOnce();
    controller.dispose();
    deferred.resolve(DOWNLOAD);
    await request;

    expect(save).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("파일 저장 자체가 실패해도 실행 상태를 해제하고 오류로 노출한다", async () => {
    const error = new Error("download click failed");
    const controller = new ChatRoomExportController({
      api: { download: vi.fn(async () => DOWNLOAD) },
      roomId: "room-01",
      save: vi.fn(() => {
        throw error;
      }),
    });

    await controller.download("FULL");

    expect(controller.getSnapshot()).toEqual({
      activeMode: null,
      error,
      failedMode: "FULL",
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
