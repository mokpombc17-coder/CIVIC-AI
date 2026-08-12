import type { ChatRoomExportApi } from "./chat-room-export-api";
import type { ChatRoomExportMode } from "./chat-room-export-contracts";
import type { saveChatRoomExport } from "./chat-room-export-download";
import { createChatRoomExportErrorPresentation } from "./chat-room-export-error-presentation";
import { downloadAndSaveRoomChatExport } from "./chat-room-export-operation";

export type ChatRoomExportControllerSnapshot = Readonly<{
  activeMode: ChatRoomExportMode | null;
  error: unknown | null;
  failedMode: ChatRoomExportMode | null;
}>;

export type ChatRoomExportControllerDependencies = Readonly<{
  api: Pick<ChatRoomExportApi, "download">;
  roomId: string;
  save: typeof saveChatRoomExport;
}>;

const INITIAL_SNAPSHOT: ChatRoomExportControllerSnapshot = {
  activeMode: null,
  error: null,
  failedMode: null,
};

export class ChatRoomExportController {
  private activeOperation: number | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private nextOperation = 0;
  private snapshot = INITIAL_SNAPSHOT;

  constructor(private readonly dependencies: ChatRoomExportControllerDependencies) {}

  readonly getSnapshot = (): ChatRoomExportControllerSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async download(mode: ChatRoomExportMode): Promise<void> {
    if (this.disposed || this.activeOperation !== null) {
      return;
    }

    const operation = this.nextOperation + 1;
    this.nextOperation = operation;
    this.activeOperation = operation;
    this.setSnapshot({ activeMode: mode, error: null, failedMode: null });

    try {
      const saved = await downloadAndSaveRoomChatExport({
        api: this.dependencies.api,
        input: { mode, roomId: this.dependencies.roomId },
        save: this.dependencies.save,
        shouldSave: () => this.isCurrent(operation),
      });

      if (saved && this.isCurrent(operation)) {
        this.setSnapshot(INITIAL_SNAPSHOT);
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.setSnapshot({ activeMode: null, error, failedMode: mode });
      }
    } finally {
      if (this.activeOperation === operation) {
        this.activeOperation = null;
      }
    }
  }

  async retry(): Promise<void> {
    const { error, failedMode } = this.snapshot;

    if (
      error === null ||
      failedMode === null ||
      !createChatRoomExportErrorPresentation(error).canRetry
    ) {
      return;
    }

    await this.download(failedMode);
  }

  resetError(): void {
    if (this.snapshot.error === null && this.snapshot.failedMode === null) {
      return;
    }

    this.setSnapshot({ ...this.snapshot, error: null, failedMode: null });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activeOperation = null;
    this.nextOperation += 1;
    this.listeners.clear();
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && this.activeOperation === operation;
  }

  private setSnapshot(snapshot: ChatRoomExportControllerSnapshot): void {
    if (this.disposed) {
      return;
    }

    this.snapshot = snapshot;

    for (const listener of this.listeners) {
      listener();
    }
  }
}
