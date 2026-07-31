import { DirectStompTransport } from "./direct-stomp-transport";
import {
  FallbackChatRealtimeTransport,
  type ChatRealtimeTransportCandidateLifecycle,
} from "./fallback-chat-realtime-transport";
import { canUseLeaderTabTransport } from "./leader-tab-worker";
import { LeaderTabTransport } from "./leader-tab-transport";
import type {
  ChatRealtimeTransport,
  ChatRealtimeTransportFactory,
} from "./chat-realtime-transport";
import { SharedWorkerTransport } from "./shared-worker-transport";

type ManagedTransportFactory = (
  lifecycle: ChatRealtimeTransportCandidateLifecycle,
) => ChatRealtimeTransport;

type CreateChatRealtimeTransportOptions = {
  createDirectTransport?: ChatRealtimeTransportFactory;
  createLeaderTabTransport?: ManagedTransportFactory;
  createSharedWorkerTransport?: ManagedTransportFactory;
  supportsLeaderTab?: boolean;
  supportsSharedWorker?: boolean;
};

export function createChatRealtimeTransport({
  createDirectTransport = () => new DirectStompTransport(),
  createLeaderTabTransport = (lifecycle) =>
    new LeaderTabTransport({
      onWorkerReady: lifecycle.onReady,
      onWorkerUnavailable: lifecycle.onUnavailable,
    }),
  createSharedWorkerTransport = (lifecycle) =>
    new SharedWorkerTransport({
      onWorkerReady: lifecycle.onReady,
      onWorkerUnavailable: lifecycle.onUnavailable,
    }),
  supportsLeaderTab = canUseLeaderTabTransport(),
  supportsSharedWorker = typeof SharedWorker !== "undefined",
}: CreateChatRealtimeTransportOptions = {}): ChatRealtimeTransport {
  const candidates = [];

  if (supportsSharedWorker) {
    candidates.push({
      name: "shared-worker" as const,
      create: createSharedWorkerTransport,
    });
  }

  if (supportsLeaderTab) {
    candidates.push({
      name: "leader-tab" as const,
      create: createLeaderTabTransport,
    });
  }

  candidates.push({
    name: "direct" as const,
    create: () => createDirectTransport(),
  });

  return new FallbackChatRealtimeTransport(candidates);
}
