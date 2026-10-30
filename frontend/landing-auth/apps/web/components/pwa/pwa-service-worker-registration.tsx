"use client";

import { useEffect } from "react";

type PwaRegistrationEnvironment = Readonly<{
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  removeLoadListener: (listener: () => void) => void;
  addUserInteractionListener: (listener: (event: Pick<Event, "isTrusted">) => void) => void;
  removeUserInteractionListener: (listener: (event: Pick<Event, "isTrusted">) => void) => void;
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
  let registrationStarted = false;
  const stopListeningForInteraction = () => {
    if (!listeningForInteraction) return;
    listeningForInteraction = false;
    environment.removeUserInteractionListener(onUserInteraction);
  };
  const onUserInteraction = (event: Pick<Event, "isTrusted">) => {
    if (!event.isTrusted || disposed || registrationStarted) return;
    registrationStarted = true;
    stopListeningForInteraction();
    // Start the origin-scoped job before a full-document navigation can discard this page's idle work.
    void environment.register().catch(() => undefined);
  };
  const listenForUserInteraction = () => {
    if (disposed || listeningForInteraction || registrationStarted) return;
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
    register: () => navigator.serviceWorker.register("/sw.js", { scope: "/" }),
  };
}
