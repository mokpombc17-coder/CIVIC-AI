export const CHAT_SHARED_WORKER_NAME = "civic-ai-chat-realtime";
export const CHAT_SHARED_WORKER_PROBE_QUERY_PARAM = "chatWorkerProbe";

export type ChatSharedWorkerProbeCommand =
  | Readonly<{
      type: "PROBE_ATTACH";
      probeId: string;
    }>
  | Readonly<{
      type: "PROBE_DETACH";
      probeId: string;
    }>;

export type ChatSharedWorkerProbeSnapshot = Readonly<{
  type: "PROBE_SNAPSHOT";
  probeId: string;
  workerInstanceId: string;
  portConnectionId: string;
  connectedPortCount: number;
}>;

export function isChatSharedWorkerProbeSnapshot(
  value: unknown,
): value is ChatSharedWorkerProbeSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ChatSharedWorkerProbeSnapshot>;

  return (
    snapshot.type === "PROBE_SNAPSHOT" &&
    typeof snapshot.probeId === "string" &&
    typeof snapshot.workerInstanceId === "string" &&
    typeof snapshot.portConnectionId === "string" &&
    typeof snapshot.connectedPortCount === "number"
  );
}
