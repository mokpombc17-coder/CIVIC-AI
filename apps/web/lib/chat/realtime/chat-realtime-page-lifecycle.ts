import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatRealtimePageLifecycleListener = () => void;

export type ChatRealtimePageLifecycleTarget = {
  addEventListener(
    type: "pagehide" | "pageshow",
    listener: ChatRealtimePageLifecycleListener,
  ): void;
  removeEventListener(
    type: "pagehide" | "pageshow",
    listener: ChatRealtimePageLifecycleListener,
  ): void;
};

export function attachChatRealtimePageLifecycle(
  transport: ChatRealtimeTransport,
  target: ChatRealtimePageLifecycleTarget,
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
    if (attached) {
      return;
    }

    detachTransport = transport.attach();
    attached = true;
  };

  target.addEventListener("pagehide", detach);
  target.addEventListener("pageshow", reattach);

  return () => {
    target.removeEventListener("pagehide", detach);
    target.removeEventListener("pageshow", reattach);
    detach();
  };
}
