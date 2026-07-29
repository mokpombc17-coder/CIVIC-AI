import { createChatStompClient } from "../../chat-stomp-client";
import { ChatSharedWorkerRuntime, type ChatSharedWorkerPort } from "./chat-shared-worker-runtime";

type SharedWorkerConnectEvent = Event & {
  readonly ports: readonly MessagePort[];
};

type SharedWorkerScope = typeof globalThis & {
  onconnect: ((event: SharedWorkerConnectEvent) => void) | null;
};

const workerScope = globalThis as unknown as SharedWorkerScope;
const runtime = new ChatSharedWorkerRuntime(createChatStompClient());

workerScope.onconnect = (event) => {
  const port = event.ports[0];

  if (port) {
    runtime.connectPort(port as ChatSharedWorkerPort);
  }
};

export {};
