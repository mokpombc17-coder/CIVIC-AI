import type { ChatRoomReadStateCoordinator } from "./chat-room-read-state-coordinator";
import type {
  ChatConnectionStatus,
  ChatRealtimeTransport,
} from "./realtime/chat-realtime-transport";

type ChatRoomReadStateLifecycleEvent = "focus" | "online";

export type ChatRoomReadStateLifecycleTarget = {
  addEventListener(type: ChatRoomReadStateLifecycleEvent, listener: () => void): void;
  removeEventListener(type: ChatRoomReadStateLifecycleEvent, listener: () => void): void;
};

export function attachChatRoomReadStateLifecycle({
  coordinator,
  onPeerConfirmed = () => undefined,
  target,
  transport,
}: Readonly<{
  coordinator: Pick<
    ChatRoomReadStateCoordinator,
    "confirmFromPeer" | "resetForPrincipalChange" | "retryPending"
  >;
  onPeerConfirmed?: () => void;
  target: ChatRoomReadStateLifecycleTarget;
  transport: Pick<
    ChatRealtimeTransport,
    | "getPrincipalGeneration"
    | "getSnapshot"
    | "observe"
    | "observePrincipalGeneration"
    | "observeRoomReadStateConfirmation"
  >;
}>): () => void {
  let previousConnectionStatus: ChatConnectionStatus = transport.getSnapshot().status;
  let previousPrincipalGeneration = transport.getPrincipalGeneration();
  const retryPending = () => coordinator.retryPending();
  const stopConnection = transport.observe(() => {
    const connectionStatus = transport.getSnapshot().status;

    if (connectionStatus === "connected" && previousConnectionStatus !== "connected") {
      retryPending();
    }

    previousConnectionStatus = connectionStatus;
  });
  const stopPrincipalGeneration = transport.observePrincipalGeneration(() => {
    const principalGeneration = transport.getPrincipalGeneration();

    if (principalGeneration !== previousPrincipalGeneration) {
      previousPrincipalGeneration = principalGeneration;
      coordinator.resetForPrincipalChange();
    }
  });
  const stopPeerConfirmations = transport.observeRoomReadStateConfirmation((confirmation) => {
    if (
      confirmation.principalGeneration === transport.getPrincipalGeneration() &&
      coordinator.confirmFromPeer(confirmation.roomId, confirmation.readThroughSequence)
    ) {
      onPeerConfirmed();
    }
  });

  target.addEventListener("focus", retryPending);
  target.addEventListener("online", retryPending);

  return () => {
    stopConnection();
    stopPeerConfirmations();
    stopPrincipalGeneration();
    target.removeEventListener("focus", retryPending);
    target.removeEventListener("online", retryPending);
  };
}
