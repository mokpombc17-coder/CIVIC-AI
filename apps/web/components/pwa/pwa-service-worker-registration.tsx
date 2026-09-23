"use client";

import { useEffect } from "react";

type PwaRegistrationEnvironment = Readonly<{
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  removeLoadListener: (listener: () => void) => void;
  addUserInteractionListener: (listener: (event: Pick<Event, "isTrusted">) => void) => void;
  removeUserInteractionListener: (listener: (event: Pick<Event, "isTrusted">) => void) => void;
  requestIdleCallback: ((callback: IdleRequestCallback) => number) | null;
  cancelIdleCallback: ((handle: number) => void) | null;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
  register: () => Promise<unknown>;
}>;

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    return schedulePwaServiceWorkerRegistration();
  }, []);

  return null;
}

export function schedulePwaServiceWorkerRegistration(
  environment: PwaRegistrationEnvironment = browserRegistrationEnvironment(),
): () => void {
  let disposed = false;
  let listeningForInteraction = false;
  let scheduled = false;
  let idleHandle: number | undefined;
  let timeoutHandle: number | undefined;

  const register = () => {
    if (disposed) return;
    void environment.register().catch(() => undefined);
  };
  const scheduleRegistration = () => {
    if (disposed || scheduled) return;
    scheduled = true;

    if (environment.requestIdleCallback) {
      idleHandle = environment.requestIdleCallback(register);
      return;
    }
    timeoutHandle = environment.setTimeout(register, 0);
  };
  const stopListeningForInteraction = () => {
    if (!listeningForInteraction) return;
    listeningForInteraction = false;
    environment.removeUserInteractionListener(onUserInteraction);
  };
  const onUserInteraction = (event: Pick<Event, "isTrusted">) => {
    if (!event.isTrusted || disposed || scheduled) return;
    stopListeningForInteraction();
    scheduleRegistration();
  };
  const listenForUserInteraction = () => {
    if (disposed || listeningForInteraction || scheduled) return;
    listeningForInteraction = true;
    environment.addUserInteractionListener(onUserInteraction);
  };

  if (environment.readyState === "complete") {
    listenForUserInteraction();
  } else {
    environment.addLoadListener(listenForUserInteraction);
  }

  return () => {
    disposed = true;
    environment.removeLoadListener(listenForUserInteraction);
    stopListeningForInteraction();
    if (idleHandle !== undefined && environment.cancelIdleCallback) {
      environment.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      environment.clearTimeout(timeoutHandle);
    }
  };
}

function browserRegistrationEnvironment(): PwaRegistrationEnvironment {
  const userInteractionEvents = ["pointerdown", "wheel", "keydown"] as const;

  return {
    readyState: document.readyState,
    addLoadListener: (listener) => window.addEventListener("load", listener, { once: true }),
    removeLoadListener: (listener) => window.removeEventListener("load", listener),
    addUserInteractionListener: (listener) => {
      for (const eventName of userInteractionEvents) {
        window.addEventListener(eventName, listener, { passive: true });
      }
    },
    removeUserInteractionListener: (listener) => {
      for (const eventName of userInteractionEvents) {
        window.removeEventListener(eventName, listener);
      }
    },
    requestIdleCallback:
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : null,
    cancelIdleCallback:
      typeof window.cancelIdleCallback === "function"
        ? window.cancelIdleCallback.bind(window)
        : null,
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (handle) => window.clearTimeout(handle),
    register: () => navigator.serviceWorker.register("/sw.js", { scope: "/" }),
  };
}
