import { createChatStompClient } from "../chat-stomp-client";
import type { ChatSharedWorkerCommand, ChatSharedWorkerEvent } from "./chat-shared-worker-protocol";
import type {
  SharedWorkerTransportErrorListener,
  SharedWorkerTransportMessageListener,
  SharedWorkerTransportPort,
  SharedWorkerTransportWorker,
} from "./shared-worker-transport";
import {
  ChatSharedWorkerRuntime,
  type ChatSharedWorkerPort,
} from "./worker/chat-shared-worker-runtime";

const CHAT_LEADER_CHANNEL_NAME = "civic-ai-chat-realtime-leader-v1";
const CHAT_LEADER_LOCK_NAME = "civic-ai-chat-realtime-leader-v1";
const HEARTBEAT_INTERVAL_MS = 1_000;
const LEADER_TIMEOUT_MS = 3_500;
const REMOTE_PORT_TIMEOUT_MS = 5_000;

type ChannelMessageListener = (event: MessageEvent<unknown>) => void;

export type LeaderTabBroadcastChannel = {
  addEventListener(type: "message" | "messageerror", listener: ChannelMessageListener): void;
  close(): void;
  postMessage(message: LeaderTabEnvelope): void;
  removeEventListener(type: "message" | "messageerror", listener: ChannelMessageListener): void;
};

export type LeaderTabLock = object;

export type LeaderTabLockManager = {
  request(
    name: string,
    options: Readonly<{ ifAvailable: true; mode: "exclusive" }>,
    callback: (lock: LeaderTabLock | null) => Promise<void> | void,
  ): Promise<void>;
};

type LeaderTabRuntime = {
  connectPort(port: ChatSharedWorkerPort): void;
};

export type LeaderTabWorkerOptions = {
  createChannel?: (name: string) => LeaderTabBroadcastChannel;
  createId?: () => string;
  createRuntime?: () => LeaderTabRuntime;
  heartbeatIntervalMs?: number;
  leaderTimeoutMs?: number;
  locks?: LeaderTabLockManager;
  now?: () => number;
  remotePortTimeoutMs?: number;
};

type LeaderTabEnvelope =
  | Readonly<{
      type: "DISCOVER_LEADER";
      senderId: string;
    }>
  | Readonly<{
      type: "LEADER_READY" | "LEADER_HEARTBEAT";
      leaderId: string;
      leaderSessionId: string;
    }>
  | Readonly<{
      type: "CLIENT_HEARTBEAT";
      leaderId: string;
      leaderSessionId: string;
      senderId: string;
    }>
  | Readonly<{
      type: "WORKER_COMMAND";
      command: ChatSharedWorkerCommand;
      leaderId: string;
      leaderSessionId: string;
      senderId: string;
    }>
  | Readonly<{
      type: "WORKER_EVENT";
      event: ChatSharedWorkerEvent;
      leaderSessionId: string;
      targetId: string;
    }>;

type StickyCommands = {
  attach: Extract<ChatSharedWorkerCommand, { type: "ATTACH" }> | null;
  claim: Extract<ChatSharedWorkerCommand, { type: "CLAIM_ROOM" }> | null;
};

type RemoteRuntimePort = {
  bridge: LeaderRuntimePort;
  lastSeenAt: number;
};

export function canUseLeaderTabTransport(): boolean {
  if (typeof BroadcastChannel === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const locks = (navigator as Navigator & { locks?: LeaderTabLockManager }).locks;
  return typeof locks?.request === "function";
}

export function createLeaderTabWorker(
  options: LeaderTabWorkerOptions = {},
): SharedWorkerTransportWorker {
  return new LeaderTabWorker(options);
}

class LeaderTabWorker implements SharedWorkerTransportWorker {
  readonly port: SharedWorkerTransportPort;
  private readonly errorListeners = new Set<SharedWorkerTransportErrorListener>();

  constructor(options: LeaderTabWorkerOptions) {
    this.port = new LeaderTabPort(options, (cause) => {
      const event = cause instanceof Event ? cause : new Event("error");
      this.errorListeners.forEach((listener) => listener(event));
    });
  }

  addEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void {
    if (type === "error") {
      this.errorListeners.add(listener);
    }
  }

  removeEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void {
    if (type === "error") {
      this.errorListeners.delete(listener);
    }
  }
}

class LeaderTabPort implements SharedWorkerTransportPort {
  private readonly coordinator: LeaderTabCoordinator;
  private readonly messageErrorListeners = new Set<SharedWorkerTransportMessageListener>();
  private readonly messageListeners = new Set<SharedWorkerTransportMessageListener>();
  private started = false;

  constructor(options: LeaderTabWorkerOptions, onError: (cause: unknown) => void) {
    this.coordinator = new LeaderTabCoordinator(
      options,
      (event) => {
        const messageEvent = { data: event } as MessageEvent<unknown>;
        this.messageListeners.forEach((listener) => listener(messageEvent));
      },
      onError,
    );
  }

  addEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void {
    (type === "message" ? this.messageListeners : this.messageErrorListeners).add(listener);
  }

  close(): void {
    this.coordinator.stop();
    this.messageListeners.clear();
    this.messageErrorListeners.clear();
  }

  postMessage(command: ChatSharedWorkerCommand): void {
    this.coordinator.sendCommand(command);
  }

  removeEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void {
    (type === "message" ? this.messageListeners : this.messageErrorListeners).delete(listener);
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.coordinator.start();
  }
}

class LeaderTabCoordinator {
  private readonly channel: LeaderTabBroadcastChannel;
  private readonly createId: () => string;
  private readonly createRuntime: () => LeaderTabRuntime;
  private electionPending = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;
  private readonly id: string;
  private lastLeaderHeartbeatAt = 0;
  private leaderId: string | null = null;
  private leaderSessionId: string | null = null;
  private readonly leaderTimeoutMs: number;
  private readonly locks: LeaderTabLockManager;
  private readonly now: () => number;
  private readonly onError: (cause: unknown) => void;
  private readonly onEvent: (event: ChatSharedWorkerEvent) => void;
  private readonly pendingCommands: ChatSharedWorkerCommand[] = [];
  private releaseLeadership: (() => void) | null = null;
  private readonly remotePorts = new Map<string, RemoteRuntimePort>();
  private readonly remotePortTimeoutMs: number;
  private runtime: LeaderTabRuntime | null = null;
  private running = false;
  private readonly sticky: StickyCommands = {
    attach: null,
    claim: null,
  };

  constructor(
    {
      createChannel = (name) => new BroadcastChannel(name) as LeaderTabBroadcastChannel,
      createId = () => crypto.randomUUID(),
      createRuntime = () =>
        new ChatSharedWorkerRuntime(
          createChatStompClient(),
          undefined,
          undefined,
          undefined,
          "leader-tab",
        ),
      heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
      leaderTimeoutMs = LEADER_TIMEOUT_MS,
      locks = (navigator as Navigator & { locks: LeaderTabLockManager }).locks,
      now = () => Date.now(),
      remotePortTimeoutMs = REMOTE_PORT_TIMEOUT_MS,
    }: LeaderTabWorkerOptions,
    onEvent: (event: ChatSharedWorkerEvent) => void,
    onError: (cause: unknown) => void,
  ) {
    this.channel = createChannel(CHAT_LEADER_CHANNEL_NAME);
    this.createId = createId;
    this.createRuntime = createRuntime;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.id = createId();
    this.leaderTimeoutMs = leaderTimeoutMs;
    this.locks = locks;
    this.now = now;
    this.onError = onError;
    this.onEvent = onEvent;
    this.remotePortTimeoutMs = remotePortTimeoutMs;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.channel.addEventListener("message", this.handleChannelMessage);
    this.channel.addEventListener("messageerror", this.handleChannelError);
    this.channel.postMessage({
      type: "DISCOVER_LEADER",
      senderId: this.id,
    });
    this.heartbeatTimer = setInterval(this.tick, this.heartbeatIntervalMs);
    this.tryAcquireLeadership();
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    const detach = this.sticky.attach
      ? ({
          type: "DETACH",
          portId: this.sticky.attach.portId,
        } satisfies ChatSharedWorkerCommand)
      : null;

    if (detach) {
      this.dispatchCommand(detach);
    }

    this.running = false;
    this.sticky.attach = null;
    this.sticky.claim = null;
    this.pendingCommands.length = 0;

    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.channel.removeEventListener("message", this.handleChannelMessage);
    this.channel.removeEventListener("messageerror", this.handleChannelError);
    this.disposeRuntime();
    this.releaseLeadership?.();
    this.releaseLeadership = null;
    this.channel.close();
  }

  sendCommand(command: ChatSharedWorkerCommand): void {
    this.rememberCommand(command);

    if (!this.running) {
      throw new Error("Leader tab transport가 시작되지 않았습니다.");
    }

    if (!this.leaderId || !this.leaderSessionId) {
      if (!isStickyCommand(command)) {
        this.pendingCommands.push(command);
      }
      return;
    }

    this.dispatchCommand(command);
  }

  private readonly tick = (): void => {
    if (!this.running) {
      return;
    }

    if (this.isLeader()) {
      this.broadcastLeader("LEADER_HEARTBEAT");
      this.pruneRemotePorts();
      return;
    }

    if (this.leaderId && this.now() - this.lastLeaderHeartbeatAt <= this.leaderTimeoutMs) {
      this.channel.postMessage({
        type: "CLIENT_HEARTBEAT",
        leaderId: this.leaderId,
        leaderSessionId: this.leaderSessionId!,
        senderId: this.id,
      });
      return;
    }

    if (this.leaderId) {
      this.leaderId = null;
      this.leaderSessionId = null;
      this.onEvent({
        type: "CONNECTION_SNAPSHOT",
        workerInstanceId: `leader-tab-${this.id}`,
        attachedPortCount: 1,
        snapshot: {
          status: "reconnecting",
          error: {
            source: "worker",
            message: "WebSocket을 소유한 탭이 종료되어 새 연결 소유자를 찾고 있습니다.",
          },
        },
      });
    }

    this.tryAcquireLeadership();
  };

  private tryAcquireLeadership(): void {
    if (!this.running || this.electionPending || this.isLeader()) {
      return;
    }

    this.electionPending = true;
    void this.locks
      .request(
        CHAT_LEADER_LOCK_NAME,
        {
          ifAvailable: true,
          mode: "exclusive",
        },
        async (lock) => {
          if (!lock || !this.running) {
            return;
          }

          await this.runAsLeader();
        },
      )
      .catch(this.onError)
      .finally(() => {
        this.electionPending = false;
      });
  }

  private async runAsLeader(): Promise<void> {
    const sessionId = this.createId();

    try {
      this.runtime = this.createRuntime();
    } catch (cause) {
      this.onError(cause);
      return;
    }

    this.leaderId = this.id;
    this.leaderSessionId = sessionId;
    this.lastLeaderHeartbeatAt = this.now();
    this.broadcastLeader("LEADER_READY");
    this.replayEndpointState();

    await new Promise<void>((resolve) => {
      this.releaseLeadership = resolve;
    });

    this.disposeRuntime();
    this.leaderId = null;
    this.leaderSessionId = null;
  }

  private readonly handleChannelMessage = (message: MessageEvent<unknown>): void => {
    const envelope = message.data;

    if (!isLeaderTabEnvelope(envelope)) {
      return;
    }

    switch (envelope.type) {
      case "DISCOVER_LEADER":
        if (this.isLeader()) {
          this.broadcastLeader("LEADER_READY");
        }
        return;
      case "LEADER_READY":
      case "LEADER_HEARTBEAT":
        this.acceptLeader(envelope);
        return;
      case "CLIENT_HEARTBEAT":
        if (this.matchesLeadership(envelope)) {
          this.touchRemotePort(envelope.senderId);
        }
        return;
      case "WORKER_COMMAND":
        if (this.matchesLeadership(envelope)) {
          this.dispatchRuntimeCommand(envelope.senderId, envelope.command);
        }
        return;
      case "WORKER_EVENT":
        if (envelope.targetId === this.id && envelope.leaderSessionId === this.leaderSessionId) {
          this.onEvent(envelope.event);
        }
    }
  };

  private readonly handleChannelError = (event: MessageEvent<unknown>): void => {
    this.onError(event);
  };

  private acceptLeader(
    envelope: Extract<LeaderTabEnvelope, { type: "LEADER_READY" | "LEADER_HEARTBEAT" }>,
  ): void {
    if (this.isLeader() && envelope.leaderId !== this.id) {
      return;
    }

    const changed =
      this.leaderId !== envelope.leaderId || this.leaderSessionId !== envelope.leaderSessionId;

    this.leaderId = envelope.leaderId;
    this.leaderSessionId = envelope.leaderSessionId;
    this.lastLeaderHeartbeatAt = this.now();

    if (changed) {
      this.replayEndpointState();
    }
  }

  private replayEndpointState(): void {
    if (!this.leaderId || !this.leaderSessionId) {
      return;
    }

    if (this.sticky.attach) {
      this.dispatchCommand(this.sticky.attach);
    }

    if (this.sticky.claim) {
      this.dispatchCommand(this.sticky.claim);
    }

    const pending = this.pendingCommands.splice(0);
    pending.forEach((command) => this.dispatchCommand(command));
  }

  private dispatchCommand(command: ChatSharedWorkerCommand): void {
    if (!this.leaderId || !this.leaderSessionId) {
      return;
    }

    if (this.isLeader()) {
      this.dispatchRuntimeCommand(this.id, command);
      return;
    }

    this.channel.postMessage({
      type: "WORKER_COMMAND",
      command,
      leaderId: this.leaderId,
      leaderSessionId: this.leaderSessionId,
      senderId: this.id,
    });
  }

  private dispatchRuntimeCommand(senderId: string, command: ChatSharedWorkerCommand): void {
    if (!this.runtime) {
      return;
    }

    let remote = this.remotePorts.get(senderId);

    if (!remote) {
      const bridge = new LeaderRuntimePort((event) => {
        if (senderId === this.id) {
          this.onEvent(event);
          return;
        }

        if (this.leaderSessionId) {
          this.channel.postMessage({
            type: "WORKER_EVENT",
            event,
            leaderSessionId: this.leaderSessionId,
            targetId: senderId,
          });
        }
      });
      this.runtime.connectPort(bridge);
      remote = {
        bridge,
        lastSeenAt: this.now(),
      };
      this.remotePorts.set(senderId, remote);
    }

    remote.lastSeenAt = this.now();
    remote.bridge.dispatch(command);
  }

  private touchRemotePort(senderId: string): void {
    const remote = this.remotePorts.get(senderId);

    if (remote) {
      remote.lastSeenAt = this.now();
    }
  }

  private pruneRemotePorts(): void {
    const expiry = this.now() - this.remotePortTimeoutMs;

    for (const [senderId, remote] of this.remotePorts) {
      if (senderId !== this.id && remote.lastSeenAt < expiry) {
        remote.bridge.dispose();
        this.remotePorts.delete(senderId);
      }
    }
  }

  private disposeRuntime(): void {
    for (const remote of this.remotePorts.values()) {
      remote.bridge.dispose();
    }

    this.remotePorts.clear();
    this.runtime = null;
  }

  private broadcastLeader(type: "LEADER_READY" | "LEADER_HEARTBEAT"): void {
    if (!this.leaderSessionId) {
      return;
    }

    this.channel.postMessage({
      type,
      leaderId: this.id,
      leaderSessionId: this.leaderSessionId,
    });
  }

  private matchesLeadership(
    envelope: Readonly<{ leaderId: string; leaderSessionId: string }>,
  ): boolean {
    return (
      this.isLeader() &&
      envelope.leaderId === this.id &&
      envelope.leaderSessionId === this.leaderSessionId
    );
  }

  private isLeader(): boolean {
    return !!this.runtime && this.leaderId === this.id && this.leaderSessionId !== null;
  }

  private rememberCommand(command: ChatSharedWorkerCommand): void {
    switch (command.type) {
      case "ATTACH":
        this.sticky.attach = command;
        return;
      case "DETACH":
        this.sticky.attach = null;
        this.sticky.claim = null;
        return;
      case "CLAIM_ROOM":
        this.sticky.claim = command;
        return;
      case "RELEASE_ROOM":
        if (this.sticky.claim?.roomId === command.roomId) {
          this.sticky.claim = null;
        }
    }
  }
}

class LeaderRuntimePort implements ChatSharedWorkerPort {
  private attachedPortId: string | null = null;
  private closed = false;
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(private readonly sendEvent: (event: ChatSharedWorkerEvent) => void) {}

  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  dispatch(command: ChatSharedWorkerCommand): void {
    if (this.closed) {
      return;
    }

    if (command.type === "ATTACH") {
      this.attachedPortId = command.portId;
    }

    const event = { data: command } as MessageEvent<unknown>;
    this.listeners.forEach((listener) => listener(event));
  }

  dispose(): void {
    if (!this.closed && this.attachedPortId) {
      this.dispatch({
        type: "DETACH",
        portId: this.attachedPortId,
      });
    }

    this.close();
  }

  postMessage(event: ChatSharedWorkerEvent): void {
    if (!this.closed) {
      this.sendEvent(event);
    }
  }

  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  start(): void {}
}

function isStickyCommand(command: ChatSharedWorkerCommand): boolean {
  return (
    command.type === "ATTACH" ||
    command.type === "DETACH" ||
    command.type === "CLAIM_ROOM" ||
    command.type === "RELEASE_ROOM"
  );
}

function isLeaderTabEnvelope(value: unknown): value is LeaderTabEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Partial<LeaderTabEnvelope>;

  if (typeof envelope.type !== "string") {
    return false;
  }

  if (envelope.type === "DISCOVER_LEADER") {
    return typeof envelope.senderId === "string";
  }

  if (envelope.type === "LEADER_READY" || envelope.type === "LEADER_HEARTBEAT") {
    return typeof envelope.leaderId === "string" && typeof envelope.leaderSessionId === "string";
  }

  if (envelope.type === "CLIENT_HEARTBEAT") {
    return (
      typeof envelope.leaderId === "string" &&
      typeof envelope.leaderSessionId === "string" &&
      typeof envelope.senderId === "string"
    );
  }

  if (envelope.type === "WORKER_COMMAND") {
    return (
      typeof envelope.leaderId === "string" &&
      typeof envelope.leaderSessionId === "string" &&
      typeof envelope.senderId === "string" &&
      !!envelope.command
    );
  }

  return (
    envelope.type === "WORKER_EVENT" &&
    typeof envelope.leaderSessionId === "string" &&
    typeof envelope.targetId === "string" &&
    !!envelope.event
  );
}
