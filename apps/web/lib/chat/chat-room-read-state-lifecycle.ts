import { AUTHENTICATION_SUCCEEDED_EVENT } from "@/lib/auth/authentication-session-events";
import type { ChatRoomReadStateCoordinator } from "./chat-room-read-state-coordinator";
import type {
  ChatConnectionStatus,
  ChatRealtimeTransport,
} from "./realtime/chat-realtime-transport";

type ChatRoomReadStateLifecycleEvent = "focus" | "online" | typeof AUTHENTICATION_SUCCEEDED_EVENT;

export type ChatRoomReadStateLifecycleTarget = {
  addEventListener(type: ChatRoomReadStateLifecycleEvent, listener: () => void): void;
  removeEventListener(type: ChatRoomReadStateLifecycleEvent, listener: () => void): void;
};

export function attachChatRoomReadStateLifecycle({
  coordinator,
  target,
  transport,
}: Readonly<{
  coordinator: Pick<ChatRoomReadStateCoordinator, "resetForPrincipalChange" | "retryPending">;
  target: ChatRoomReadStateLifecycleTarget;
  transport: Pick<ChatRealtimeTransport, "getSnapshot" | "observe">;
}>): () => void {
  let previousConnectionStatus: ChatConnectionStatus = transport.getSnapshot().status;
  const retryPending = () => coordinator.retryPending();
  const resetForAuthentication = () => coordinator.resetForPrincipalChange();
  const stopConnection = transport.observe(() => {
    const connectionStatus = transport.getSnapshot().status;

    if (connectionStatus === "connected" && previousConnectionStatus !== "connected") {
      retryPending();
    }

    previousConnectionStatus = connectionStatus;
  });

  target.addEventListener("focus", retryPending);
  target.addEventListener("online", retryPending);
  target.addEventListener(AUTHENTICATION_SUCCEEDED_EVENT, resetForAuthentication);

  return () => {
    stopConnection();
    target.removeEventListener("focus", retryPending);
    target.removeEventListener("online", retryPending);
    target.removeEventListener(AUTHENTICATION_SUCCEEDED_EVENT, resetForAuthentication);
  };
}
