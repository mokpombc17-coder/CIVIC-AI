import { describe, expect, it } from "vitest";
import type { ChatSharedWorkerCommand, ChatSharedWorkerEvent } from "./chat-shared-worker-protocol";
import {
  createLeaderTabWorker,
  type LeaderTabBroadcastChannel,
  type LeaderTabLock,
  type LeaderTabLockManager,
} from "./leader-tab-worker";
import type { SharedWorkerTransportPort } from "./shared-worker-transport";
import type { ChatSharedWorkerPort } from "./worker/chat-shared-worker-runtime";

describe("LeaderTabWorker", () => {
  it("여러 탭에서 runtime과 WebSocket 소유자를 하나만 만든다", async () => {
    const hub = new FakeBroadcastHub();
    const locks = new FakeLockManager();
    const runtimes: FakeRuntime[] = [];
    const workerA = createWorker("tab-a", hub, locks, runtimes);
    const workerB = createWorker("tab-b", hub, locks, runtimes);

    const eventsA = observeEvents(workerA.port);
    const eventsB = observeEvents(workerB.port);
    workerA.port.start();
    workerB.port.start();
    workerA.port.postMessage({ type: "ATTACH", portId: "port-a" });
    workerB.port.postMessage({ type: "ATTACH", portId: "port-b" });
    await settle();

    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]!.commands.map((entry) => entry.command)).toEqual(
      expect.arrayContaining([
        { type: "ATTACH", portId: "port-a" },
        { type: "ATTACH", portId: "port-b" },
      ]),
    );
    expect(eventsA.some((event) => event.type === "CONNECTION_SNAPSHOT")).toBe(true);
    expect(eventsB.some((event) => event.type === "CONNECTION_SNAPSHOT")).toBe(true);

    workerA.port.close();
    workerB.port.close();
  });

  it("leader 탭 종료 후 follower를 새 leader로 선출하고 sticky 방 claim을 복원한다", async () => {
    const hub = new FakeBroadcastHub();
    const locks = new FakeLockManager();
    const runtimes: FakeRuntime[] = [];
    const workerA = createWorker("tab-a", hub, locks, runtimes);
    const workerB = createWorker("tab-b", hub, locks, runtimes);

    workerA.port.start();
    workerB.port.start();
    workerA.port.postMessage({ type: "ATTACH", portId: "port-a" });
    workerB.port.postMessage({ type: "ATTACH", portId: "port-b" });
    workerB.port.postMessage({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "claim-b",
      roomId: "room-b",
    });
    await settle();

    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]!.commands.map((entry) => entry.command)).toContainEqual({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "claim-b",
      roomId: "room-b",
    });

    workerA.port.close();
    await waitFor(() => runtimes.length === 2);

    expect(runtimes[1]!.commands.map((entry) => entry.command)).toEqual(
      expect.arrayContaining([
        { type: "ATTACH", portId: "port-b" },
        {
          type: "CLAIM_ROOM",
          portId: "port-b",
          requestId: "claim-b",
          roomId: "room-b",
        },
      ]),
    );

    workerB.port.close();
  });
});

function createWorker(
  prefix: string,
  hub: FakeBroadcastHub,
  locks: FakeLockManager,
  runtimes: FakeRuntime[],
) {
  let idSequence = 0;

  return createLeaderTabWorker({
    createChannel: () => hub.createChannel(),
    createId: () => `${prefix}-${++idSequence}`,
    createRuntime: () => {
      const runtime = new FakeRuntime();
      runtimes.push(runtime);
      return runtime;
    },
    heartbeatIntervalMs: 5,
    leaderTimeoutMs: 15,
    locks,
    remotePortTimeoutMs: 25,
  });
}

function observeEvents(
  port: Pick<SharedWorkerTransportPort, "addEventListener">,
): ChatSharedWorkerEvent[] {
  const events: ChatSharedWorkerEvent[] = [];
  port.addEventListener("message", (event: MessageEvent<unknown>) => {
    events.push(event.data as ChatSharedWorkerEvent);
  });
  return events;
}

class FakeRuntime {
  readonly commands: { command: ChatSharedWorkerCommand; port: ChatSharedWorkerPort }[] = [];

  connectPort(port: ChatSharedWorkerPort): void {
    port.addEventListener("message", (event) => {
      const command = event.data as ChatSharedWorkerCommand;
      this.commands.push({ command, port });

      if (command.type === "ATTACH") {
        port.postMessage({
          type: "CONNECTION_SNAPSHOT",
          workerInstanceId: "leader-runtime",
          attachedPortCount: 1,
          snapshot: {
            status: "connected",
            error: null,
          },
        });
      }
    });
    port.start();
  }
}

type ChannelEnvelope = Parameters<LeaderTabBroadcastChannel["postMessage"]>[0];
type ChannelListener = Parameters<LeaderTabBroadcastChannel["addEventListener"]>[1];

class FakeBroadcastHub {
  private readonly channels = new Set<FakeBroadcastChannel>();

  createChannel(): LeaderTabBroadcastChannel {
    const channel = new FakeBroadcastChannel(this);
    this.channels.add(channel);
    return channel;
  }

  deliver(sender: FakeBroadcastChannel, message: ChannelEnvelope): void {
    queueMicrotask(() => {
      this.channels.forEach((channel) => {
        if (channel !== sender) {
          channel.receive(message);
        }
      });
    });
  }

  remove(channel: FakeBroadcastChannel): void {
    this.channels.delete(channel);
  }
}

class FakeBroadcastChannel implements LeaderTabBroadcastChannel {
  private readonly listeners = new Set<ChannelListener>();

  constructor(private readonly hub: FakeBroadcastHub) {}

  addEventListener(type: "message" | "messageerror", listener: ChannelListener): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  close(): void {
    this.listeners.clear();
    this.hub.remove(this);
  }

  postMessage(message: ChannelEnvelope): void {
    this.hub.deliver(this, message);
  }

  receive(message: ChannelEnvelope): void {
    const event = { data: message } as MessageEvent<unknown>;
    this.listeners.forEach((listener) => listener(event));
  }

  removeEventListener(type: "message" | "messageerror", listener: ChannelListener): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }
}

class FakeLockManager implements LeaderTabLockManager {
  private held = false;

  async request(
    _name: string,
    _options: Readonly<{ ifAvailable: true; mode: "exclusive" }>,
    callback: (lock: LeaderTabLock | null) => Promise<void> | void,
  ): Promise<void> {
    if (this.held) {
      await callback(null);
      return;
    }

    this.held = true;

    try {
      await callback({});
    } finally {
      this.held = false;
    }
  }
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 250;

  while (!predicate()) {
    if (Date.now() >= timeoutAt) {
      throw new Error("조건이 제한 시간 안에 충족되지 않았습니다.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
