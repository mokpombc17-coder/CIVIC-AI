import type { ChatRealtimeTransport } from "../chat-realtime-transport";
import type { ChatRealtimeDiagnosticSnapshot } from "./chat-realtime-diagnostic-events";

export type ChatRealtimeDiagnosticsDevtools = Readonly<{
  snapshot(): Promise<ChatRealtimeDiagnosticSnapshot>;
  clear(): Promise<void>;
  download(): Promise<void>;
}>;

declare global {
  interface Window {
    __CHAT_REALTIME_DIAGNOSTICS__?: ChatRealtimeDiagnosticsDevtools;
  }
}

type ChatRealtimeDiagnosticsDevtoolsTarget = {
  __CHAT_REALTIME_DIAGNOSTICS__?: ChatRealtimeDiagnosticsDevtools;
};

type ChatRealtimeDiagnosticsTransport = Pick<
  ChatRealtimeTransport,
  "clearDiagnostics" | "getDiagnosticSnapshot"
>;

type AttachChatRealtimeDiagnosticsDevtoolsOptions = Readonly<{
  enabled?: boolean;
  downloadSnapshot?: (snapshot: ChatRealtimeDiagnosticSnapshot) => void;
}>;

export function attachChatRealtimeDiagnosticsDevtools(
  transport: ChatRealtimeDiagnosticsTransport,
  target: ChatRealtimeDiagnosticsDevtoolsTarget,
  {
    enabled = process.env.NODE_ENV === "development",
    downloadSnapshot = downloadChatRealtimeDiagnosticSnapshot,
  }: AttachChatRealtimeDiagnosticsDevtoolsOptions = {},
): () => void {
  if (!enabled) {
    return () => undefined;
  }

  const previous = target.__CHAT_REALTIME_DIAGNOSTICS__;
  const devtools: ChatRealtimeDiagnosticsDevtools = Object.freeze({
    snapshot: () => transport.getDiagnosticSnapshot(),
    clear: () => transport.clearDiagnostics(),
    download: async () => {
      const snapshot = await transport.getDiagnosticSnapshot();
      downloadSnapshot(snapshot);
    },
  });
  target.__CHAT_REALTIME_DIAGNOSTICS__ = devtools;

  return () => {
    if (target.__CHAT_REALTIME_DIAGNOSTICS__ !== devtools) {
      return;
    }

    if (previous) {
      target.__CHAT_REALTIME_DIAGNOSTICS__ = previous;
      return;
    }

    delete target.__CHAT_REALTIME_DIAGNOSTICS__;
  };
}

export function serializeChatRealtimeDiagnosticSnapshot(
  snapshot: ChatRealtimeDiagnosticSnapshot,
): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function createChatRealtimeDiagnosticFileName(capturedAt: string): string {
  const safeTimestamp = capturedAt.replace(/[:.]/g, "-");
  return `chat-realtime-diagnostics-${safeTimestamp}.json`;
}

export function downloadChatRealtimeDiagnosticSnapshot(
  snapshot: ChatRealtimeDiagnosticSnapshot,
): void {
  const blob = new Blob([serializeChatRealtimeDiagnosticSnapshot(snapshot)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = url;
    anchor.download = createChatRealtimeDiagnosticFileName(snapshot.capturedAt);
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
