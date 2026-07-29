import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatRealtimeRoomLifecycleListener = () => void;

export type ChatRealtimeRoomLifecycleTarget = {
  addEventListener(type: "pageshow", listener: ChatRealtimeRoomLifecycleListener): void;
  removeEventListener(type: "pageshow", listener: ChatRealtimeRoomLifecycleListener): void;
};

type ScheduleRoomClaim = (claim: () => void) => void;

export function attachChatRealtimeRoomLifecycle(
  transport: ChatRealtimeTransport,
  roomId: string,
  target: ChatRealtimeRoomLifecycleTarget,
  scheduleRoomClaim: ScheduleRoomClaim = queueMicrotask,
): () => void {
  let attached = true;
  const claimRoom = () => {
    if (attached) {
      transport.claimRoom(roomId);
    }
  };
  const reclaimAfterPageRestore = () => {
    scheduleRoomClaim(claimRoom);
  };

  claimRoom();
  target.addEventListener("pageshow", reclaimAfterPageRestore);

  return () => {
    attached = false;
    target.removeEventListener("pageshow", reclaimAfterPageRestore);
    transport.releaseRoom(roomId);
  };
}
