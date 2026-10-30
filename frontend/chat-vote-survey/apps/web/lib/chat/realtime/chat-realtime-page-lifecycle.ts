import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatRealtimePageLifecycleListener = () => void;

export type ChatRealtimePageLifecycleTarget = {
  addEventListener(
    type: "online" | "pagehide" | "pageshow",
    listener: ChatRealtimePageLifecycleListener,
  ): void;
  removeEventListener(
    type: "online" | "pagehide" | "pageshow",
    listener: ChatRealtimePageLifecycleListener,
  ): void;
};

export type ChatRealtimeVisibilityTarget = {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: ChatRealtimePageLifecycleListener): void;
  removeEventListener(type: "visibilitychange", listener: ChatRealtimePageLifecycleListener): void;
};

type ChatRealtimePageLifecycleOptions = Readonly<{
  onResume?: () => void;
  visibilityTarget?: ChatRealtimeVisibilityTarget;
}>;

export function attachChatRealtimePageLifecycle(
  transport: ChatRealtimeTransport,
  target: ChatRealtimePageLifecycleTarget,
  { onResume = () => {}, visibilityTarget }: ChatRealtimePageLifecycleOptions = {},
): () => void {
  let detachTransport = transport.attach();
  let attached = true;

  const detach = () => {
    if (!attached) {
      return;
    }

    attached = false;
    detachTransport();
  };
  const reattach = () => {
    if (!attached) {
      detachTransport = transport.attach();
      attached = true;
    }

    onResume();
  };
  const handleVisibilityChange = () => {
    if (visibilityTarget?.visibilityState === "visible") {
      reattach();
    }
  };

  target.addEventListener("pagehide", detach);
  target.addEventListener("pageshow", reattach);
  target.addEventListener("online", reattach);
  visibilityTarget?.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    target.removeEventListener("pagehide", detach);
    target.removeEventListener("pageshow", reattach);
    target.removeEventListener("online", reattach);
    visibilityTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
    detach();
  };
}
