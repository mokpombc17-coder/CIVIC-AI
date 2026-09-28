import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatRealtimeRoomLifecycleListener = () => void;

export type ChatRealtimeRoomLifecycleTarget = {
  addEventListener(
    type: "blur" | "focus" | "pagehide" | "pageshow",
    listener: ChatRealtimeRoomLifecycleListener,
  ): void;
  removeEventListener(
    type: "blur" | "focus" | "pagehide" | "pageshow",
    listener: ChatRealtimeRoomLifecycleListener,
  ): void;
};

export type ChatRealtimeRoomVisibilityTarget = {
  readonly visibilityState: DocumentVisibilityState;
  hasFocus(): boolean;
  addEventListener(type: "visibilitychange", listener: ChatRealtimeRoomLifecycleListener): void;
  removeEventListener(type: "visibilitychange", listener: ChatRealtimeRoomLifecycleListener): void;
};

type ScheduleRoomClaim = (claim: () => void) => void;

type ChatRealtimeRoomLifecycleOptions = Readonly<{
  scheduleRoomClaim?: ScheduleRoomClaim;
  visibilityTarget?: ChatRealtimeRoomVisibilityTarget;
}>;

export function attachChatRealtimeRoomLifecycle(
  transport: ChatRealtimeTransport,
  roomId: string,
  target: ChatRealtimeRoomLifecycleTarget,
  { scheduleRoomClaim = queueMicrotask, visibilityTarget }: ChatRealtimeRoomLifecycleOptions = {},
): () => void {
  let attached = true;
  let claimScheduled = false;
  let foregroundReclaimPending = false;

  const isForeground = () =>
    visibilityTarget === undefined ||
    (visibilityTarget.visibilityState === "visible" && visibilityTarget.hasFocus());
  const cancelForegroundReclaim = () => {
    foregroundReclaimPending = false;
  };
  const scheduleForegroundReclaim = () => {
    if (!attached || !foregroundReclaimPending || claimScheduled) {
      return;
    }

    claimScheduled = true;
    scheduleRoomClaim(() => {
      claimScheduled = false;

      if (!attached || !foregroundReclaimPending || !isForeground()) {
        return;
      }

      const connectionSnapshot = transport.getSnapshot();

      if (connectionSnapshot.status === "replaced") {
        cancelForegroundReclaim();
        return;
      }

      if (connectionSnapshot.status !== "connected") {
        return;
      }

      const roomSnapshot = transport.getRoomSnapshot();

      if (roomSnapshot.status === "active" && roomSnapshot.roomId === roomId) {
        cancelForegroundReclaim();
        return;
      }

      const canReclaimIdleRoom = roomSnapshot.status === "idle";
      const canReclaimReplacedRoom =
        roomSnapshot.status === "replaced" && roomSnapshot.roomId === roomId;

      if (!canReclaimIdleRoom && !canReclaimReplacedRoom) {
        cancelForegroundReclaim();
        return;
      }

      cancelForegroundReclaim();
      transport.claimRoom(roomId);
    });
  };
  const requestForegroundReclaim = () => {
    if (!attached || !isForeground()) {
      return;
    }

    const roomSnapshot = transport.getRoomSnapshot();

    if (
      roomSnapshot.status !== "idle" &&
      !(roomSnapshot.status === "replaced" && roomSnapshot.roomId === roomId)
    ) {
      return;
    }

    foregroundReclaimPending = true;
    scheduleForegroundReclaim();
  };
  const handleVisibilityChange = () => {
    if (visibilityTarget?.visibilityState === "visible") {
      requestForegroundReclaim();
      return;
    }

    cancelForegroundReclaim();
  };
  const handleConnectionChange = () => {
    if (foregroundReclaimPending) {
      scheduleForegroundReclaim();
    }
  };
  const handleRoomChange = () => {
    const roomSnapshot = transport.getRoomSnapshot();

    if (roomSnapshot.status === "active" && roomSnapshot.roomId === roomId) {
      cancelForegroundReclaim();
      return;
    }

    if (roomSnapshot.status === "replaced" && roomSnapshot.roomId === roomId && isForeground()) {
      foregroundReclaimPending = true;
      scheduleForegroundReclaim();
    }
  };

  transport.claimRoom(roomId);
  const stopConnectionObserver = transport.observe(handleConnectionChange);
  const stopRoomObserver = transport.observeRoom(handleRoomChange);
  target.addEventListener("blur", cancelForegroundReclaim);
  target.addEventListener("focus", requestForegroundReclaim);
  target.addEventListener("pagehide", cancelForegroundReclaim);
  target.addEventListener("pageshow", requestForegroundReclaim);
  visibilityTarget?.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    attached = false;
    cancelForegroundReclaim();
    visibilityTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
    target.removeEventListener("pageshow", requestForegroundReclaim);
    target.removeEventListener("pagehide", cancelForegroundReclaim);
    target.removeEventListener("focus", requestForegroundReclaim);
    target.removeEventListener("blur", cancelForegroundReclaim);
    stopRoomObserver();
    stopConnectionObserver();
    transport.releaseRoom(roomId);
  };
}
