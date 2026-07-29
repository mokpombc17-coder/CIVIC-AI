import { DirectStompTransport } from "./direct-stomp-transport";
import type {
  ChatRealtimeTransport,
  ChatRealtimeTransportFactory,
} from "./chat-realtime-transport";
import { SharedWorkerTransport } from "./shared-worker-transport";

type CreateChatRealtimeTransportOptions = {
  createDirectTransport?: ChatRealtimeTransportFactory;
  createSharedWorkerTransport?: ChatRealtimeTransportFactory;
  supportsSharedWorker?: boolean;
};

export function createChatRealtimeTransport({
  createDirectTransport = () => new DirectStompTransport(),
  createSharedWorkerTransport = () => new SharedWorkerTransport(),
  supportsSharedWorker = typeof SharedWorker !== "undefined",
}: CreateChatRealtimeTransportOptions = {}): ChatRealtimeTransport {
  return supportsSharedWorker ? createSharedWorkerTransport() : createDirectTransport();
}
