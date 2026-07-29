import type {
  ChatSharedWorkerProbeCommand,
  ChatSharedWorkerProbeSnapshot,
} from "../chat-shared-worker-probe-protocol";

type SharedWorkerConnectEvent = Event & {
  readonly ports: readonly MessagePort[];
};

type SharedWorkerScope = typeof globalThis & {
  onconnect: ((event: SharedWorkerConnectEvent) => void) | null;
};

type ConnectedProbe = {
  port: MessagePort;
  probeId: string | null;
  portConnectionId: string;
};

const workerScope = globalThis as unknown as SharedWorkerScope;
const workerInstanceId = crypto.randomUUID();
const connectedProbes = new Map<MessagePort, ConnectedProbe>();

workerScope.onconnect = (event) => {
  const port = event.ports[0];

  if (!port) {
    return;
  }

  connectedProbes.set(port, {
    port,
    probeId: null,
    portConnectionId: crypto.randomUUID(),
  });

  port.addEventListener("message", (messageEvent: MessageEvent<unknown>) => {
    const command = messageEvent.data as Partial<ChatSharedWorkerProbeCommand>;

    if (command.type === "PROBE_ATTACH" && typeof command.probeId === "string") {
      const connectedProbe = connectedProbes.get(port);

      if (!connectedProbe) {
        return;
      }

      connectedProbe.probeId = command.probeId;
      broadcastSnapshots();
      return;
    }

    if (command.type === "PROBE_DETACH" && command.probeId === connectedProbes.get(port)?.probeId) {
      connectedProbes.delete(port);
      port.close();
      broadcastSnapshots();
    }
  });
  port.start();
};

function broadcastSnapshots(): void {
  const attachedProbes = [...connectedProbes.values()].filter(
    (connectedProbe): connectedProbe is ConnectedProbe & { probeId: string } =>
      connectedProbe.probeId !== null,
  );

  for (const connectedProbe of attachedProbes) {
    const snapshot: ChatSharedWorkerProbeSnapshot = {
      type: "PROBE_SNAPSHOT",
      probeId: connectedProbe.probeId,
      workerInstanceId,
      portConnectionId: connectedProbe.portConnectionId,
      connectedPortCount: attachedProbes.length,
    };

    connectedProbe.port.postMessage(snapshot);
  }
}

export {};
