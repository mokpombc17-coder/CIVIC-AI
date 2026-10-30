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
  let tabReturnReclaimArmed = false;
  let claimScheduled = false;
  let foregroundReclaimPending = false;

  const isForeground = () =>
    visibilityTarget === undefined ||
    (visibilityTarget.visibilityState === "visible" && visibilityTarget.hasFocus());
  const cancelForegroundReclaim = () => {
    foregroundReclaimPending = false;
  };
  const disarmTabReturnReclaim = () => {
    tabReturnReclaimArmed = false;
    cancelForegroundReclaim();
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
        disarmTabReturnReclaim();
        return;
      }

      if (connectionSnapshot.status !== "connected") {
        return;
      }

      const roomSnapshot = transport.getRoomSnapshot();

      if (roomSnapshot.status === "active" && roomSnapshot.roomId === roomId) {
        disarmTabReturnReclaim();
        return;
      }

      const canReclaimIdleRoom = roomSnapshot.status === "idle";
      const canReclaimReplacedRoom =
        roomSnapshot.status === "replaced" && roomSnapshot.roomId === roomId;

      if (!canReclaimIdleRoom && !canReclaimReplacedRoom) {
        disarmTabReturnReclaim();
        return;
      }

      disarmTabReturnReclaim();
      transport.claimRoom(roomId);
    });
  };
  const armTabReturnReclaim = () => {
    if (!attached) {
      return;
    }

    tabReturnReclaimArmed = true;

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
  const handleFocus = () => {
    if (foregroundReclaimPending) {
      scheduleForegroundReclaim();
    }
  };
  const handleVisibilityChange = () => {
    if (visibilityTarget?.visibilityState === "visible") {
      armTabReturnReclaim();
      return;
    }

    disarmTabReturnReclaim();
  };
  const handleConnectionChange = () => {
    if (foregroundReclaimPending) {
      scheduleForegroundReclaim();
    }
  };
  const handleRoomChange = () => {
    const roomSnapshot = transport.getRoomSnapshot();

    if (roomSnapshot.status === "active" && roomSnapshot.roomId === roomId) {
      disarmTabReturnReclaim();
      return;
    }

    if (
      tabReturnReclaimArmed &&
      roomSnapshot.status === "replaced" &&
      roomSnapshot.roomId === roomId &&
      isForeground()
    ) {
      foregroundReclaimPending = true;
      scheduleForegroundReclaim();
    }
  };

  transport.claimRoom(roomId);
  const stopConnectionObserver = transport.observe(handleConnectionChange);
  const stopRoomObserver = transport.observeRoom(handleRoomChange);
  target.addEventListener("blur", disarmTabReturnReclaim);
  target.addEventListener("focus", handleFocus);
  target.addEventListener("pagehide", disarmTabReturnReclaim);
  target.addEventListener("pageshow", armTabReturnReclaim);
  visibilityTarget?.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    attached = false;
    disarmTabReturnReclaim();
    visibilityTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
    target.removeEventListener("pageshow", armTabReturnReclaim);
    target.removeEventListener("pagehide", disarmTabReturnReclaim);
    target.removeEventListener("focus", handleFocus);
    target.removeEventListener("blur", disarmTabReturnReclaim);
    stopRoomObserver();
    stopConnectionObserver();
    transport.releaseRoom(roomId);
  };
}
