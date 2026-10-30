import type {
  ChatRoomReadStateCancellationReason,
  ChatRoomReadStateCoordinator,
} from "./chat-room-read-state-coordinator";
import { canResumeChatRoomReadStateAfterSynchronization } from "./chat-room-read-state-error-policy";

export function applyChatRoomReadStateRoomLifecycle({
  coordinator,
  isSynchronizationReady,
  roomId,
  terminalReason,
}: Readonly<{
  coordinator: Pick<
    ChatRoomReadStateCoordinator,
    "cancelRoom" | "getRoomSnapshot" | "resumeRoom" | "retryPending"
  >;
  isSynchronizationReady: boolean;
  roomId: string;
  terminalReason: ChatRoomReadStateCancellationReason | null;
}>): void {
  if (terminalReason !== null) {
    coordinator.cancelRoom(roomId, terminalReason);
    return;
  }

  if (!isSynchronizationReady) {
    return;
  }

  const snapshot = coordinator.getRoomSnapshot(roomId);

  if (snapshot?.status === "pending") {
    coordinator.retryPending(roomId);
  } else if (snapshot && canResumeChatRoomReadStateAfterSynchronization(snapshot.lastError)) {
    coordinator.resumeRoom(roomId);
  }
}
