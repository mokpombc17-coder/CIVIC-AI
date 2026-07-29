import {
  CHAT_SHARED_WORKER_NAME,
  CHAT_SHARED_WORKER_PROBE_QUERY_PARAM,
  isChatSharedWorkerProbeSnapshot,
  type ChatSharedWorkerProbeCommand,
  type ChatSharedWorkerProbeSnapshot,
} from "./chat-shared-worker-probe-protocol";

type ChatSharedWorkerProbeEventListener = (event: MessageEvent<unknown>) => void;

type ChatSharedWorkerProbePort = {
  addEventListener(
    type: "message" | "messageerror",
    listener: ChatSharedWorkerProbeEventListener,
  ): void;
  close(): void;
  postMessage(message: ChatSharedWorkerProbeCommand): void;
  removeEventListener(
    type: "message" | "messageerror",
    listener: ChatSharedWorkerProbeEventListener,
  ): void;
  start(): void;
};

type ChatSharedWorkerProbe = {
  readonly port: ChatSharedWorkerProbePort;
};

type AttachChatSharedWorkerProbeOptions = {
  createId?: () => string;
  createWorker?: () => ChatSharedWorkerProbe;
  onError?: (error: unknown) => void;
  onSnapshot?: (snapshot: ChatSharedWorkerProbeSnapshot) => void;
};

export function isChatSharedWorkerProbeEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get(CHAT_SHARED_WORKER_PROBE_QUERY_PARAM);

  return value === "1" || value === "true";
}

export function attachChatSharedWorkerProbe({
  createId = () => crypto.randomUUID(),
  createWorker = createBrowserChatSharedWorker,
  onError = logProbeError,
  onSnapshot = logProbeSnapshot,
}: AttachChatSharedWorkerProbeOptions = {}): () => void {
  let worker: ChatSharedWorkerProbe;

  try {
    worker = createWorker();
  } catch (error) {
    onError(error);
    return () => {};
  }

  const probeId = createId();
  const { port } = worker;
  let attached = true;

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (!isChatSharedWorkerProbeSnapshot(event.data) || event.data.probeId !== probeId) {
      return;
    }

    onSnapshot(event.data);
  };
  const handleMessageError = (event: MessageEvent<unknown>) => {
    onError(event);
  };

  port.addEventListener("message", handleMessage);
  port.addEventListener("messageerror", handleMessageError);
  port.start();
  postProbeCommand(port, {
    type: "PROBE_ATTACH",
    probeId,
  });

  return () => {
    if (!attached) {
      return;
    }

    attached = false;
    postProbeCommand(port, {
      type: "PROBE_DETACH",
      probeId,
    });
    port.removeEventListener("message", handleMessage);
    port.removeEventListener("messageerror", handleMessageError);
    port.close();
  };
}

function createBrowserChatSharedWorker(): ChatSharedWorkerProbe {
  const worker = new SharedWorker(
    new URL("./worker/chat-realtime.shared-worker.ts", import.meta.url),
    {
      name: CHAT_SHARED_WORKER_NAME,
      type: "module",
    },
  );

  return {
    port: worker.port,
  };
}

function postProbeCommand(
  port: Pick<ChatSharedWorkerProbePort, "postMessage">,
  command: ChatSharedWorkerProbeCommand,
): void {
  port.postMessage(command);
}

function logProbeSnapshot(snapshot: ChatSharedWorkerProbeSnapshot): void {
  console.info("[chat:shared-worker:probe]", snapshot);
}

function logProbeError(error: unknown): void {
  console.error("[chat:shared-worker:probe] SharedWorker probe failed.", error);
}
