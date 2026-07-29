import { Client, type debugFnType } from "@stomp/stompjs";
import { CHAT_WEBSOCKET_URL } from "./chat-config";

export const CHAT_STOMP_HEARTBEAT_MS = 10_000;
export const CHAT_STOMP_RECONNECT_DELAY_MS = 3_000;

type CreateChatStompClientOptions = {
  brokerURL?: string;
  debug?: debugFnType;
};

export function createChatStompClient({
  brokerURL = CHAT_WEBSOCKET_URL,
  debug = createChatStompDebug(),
}: CreateChatStompClientOptions = {}): Client {
  return new Client({
    brokerURL,
    connectHeaders: {},
    heartbeatIncoming: CHAT_STOMP_HEARTBEAT_MS,
    heartbeatOutgoing: CHAT_STOMP_HEARTBEAT_MS,
    reconnectDelay: CHAT_STOMP_RECONNECT_DELAY_MS,
    debug,
  });
}

export function createChatStompDebug(
  environment = process.env.NODE_ENV,
  log: debugFnType = console.debug,
): debugFnType {
  if (environment !== "development") {
    return () => {};
  }

  return (message) => {
    log(`[chat:stomp] ${message}`);
  };
}
