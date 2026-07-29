import { DirectStompTransport } from "./direct-stomp-transport";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";

export function createChatRealtimeTransport(): ChatRealtimeTransport {
  return new DirectStompTransport();
}
