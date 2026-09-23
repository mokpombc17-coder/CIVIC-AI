import { describe, expect, it, vi } from "vitest";
import { schedulePwaServiceWorkerRegistration } from "./pwa-service-worker-registration";

describe("schedulePwaServiceWorkerRegistration", () => {
  it("waits for load, a trusted user interaction, and then an idle period", () => {
    const harness = createRegistrationHarness("loading");
    const cleanup = schedulePwaServiceWorkerRegistration(harness.environment);

    expect(harness.register).not.toHaveBeenCalled();
    expect(harness.addLoadListener).toHaveBeenCalledOnce();
    expect(harness.addUserInteractionListener).not.toHaveBeenCalled();

    harness.loadListener?.();
    expect(harness.addUserInteractionListener).toHaveBeenCalledOnce();
    expect(harness.requestIdleCallback).not.toHaveBeenCalled();

    harness.interactionListener?.({ isTrusted: false });
    expect(harness.requestIdleCallback).not.toHaveBeenCalled();

    harness.interactionListener?.({ isTrusted: true });
    expect(harness.removeUserInteractionListener).toHaveBeenCalledOnce();
    expect(harness.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function));
    expect(harness.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(harness.register).not.toHaveBeenCalled();

    harness.idleCallback?.(idleDeadline());
    expect(harness.register).toHaveBeenCalledOnce();

    cleanup();
  });

  it("starts listening immediately when load already completed", () => {
    const harness = createRegistrationHarness("complete");

    schedulePwaServiceWorkerRegistration(harness.environment);

    expect(harness.addLoadListener).not.toHaveBeenCalled();
    expect(harness.addUserInteractionListener).toHaveBeenCalledOnce();
    expect(harness.requestIdleCallback).not.toHaveBeenCalled();
    expect(harness.register).not.toHaveBeenCalled();
  });

  it("uses the next timer task only when requestIdleCallback is unavailable", () => {
    const harness = createRegistrationHarness("complete", false);

    schedulePwaServiceWorkerRegistration(harness.environment);

    harness.interactionListener?.({ isTrusted: true });
    expect(harness.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(harness.register).not.toHaveBeenCalled();
    harness.timeoutCallback?.();
    expect(harness.register).toHaveBeenCalledOnce();
  });

  it("removes pending interaction listeners when the component unmounts", () => {
    const harness = createRegistrationHarness("complete");
    const cleanup = schedulePwaServiceWorkerRegistration(harness.environment);

    cleanup();

    expect(harness.removeLoadListener).toHaveBeenCalledOnce();
    expect(harness.removeUserInteractionListener).toHaveBeenCalledOnce();
    harness.interactionListener?.({ isTrusted: true });
    expect(harness.requestIdleCallback).not.toHaveBeenCalled();
    expect(harness.register).not.toHaveBeenCalled();
  });

  it("cancels pending idle registration when the component unmounts", () => {
    const harness = createRegistrationHarness("complete");
    const cleanup = schedulePwaServiceWorkerRegistration(harness.environment);

    harness.interactionListener?.({ isTrusted: true });
    cleanup();

    expect(harness.removeLoadListener).toHaveBeenCalledOnce();
    expect(harness.cancelIdleCallback).toHaveBeenCalledWith(17);
    harness.idleCallback?.(idleDeadline());
    expect(harness.register).not.toHaveBeenCalled();
  });
});

function createRegistrationHarness(readyState: DocumentReadyState, supportsIdle = true) {
  let loadListener: (() => void) | undefined;
  let interactionListener: ((event: Pick<Event, "isTrusted">) => void) | undefined;
  let idleCallback: IdleRequestCallback | undefined;
  let timeoutCallback: (() => void) | undefined;
  const addLoadListener = vi.fn((listener: () => void) => {
    loadListener = listener;
  });
  const removeLoadListener = vi.fn();
  const addUserInteractionListener = vi.fn(
    (listener: (event: Pick<Event, "isTrusted">) => void) => {
      interactionListener = listener;
    },
  );
  const removeUserInteractionListener = vi.fn();
  const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    idleCallback = callback;
    return 17;
  });
  const cancelIdleCallback = vi.fn();
  const setTimeout = vi.fn((callback: () => void) => {
    timeoutCallback = callback;
    return 23;
  });
  const clearTimeout = vi.fn();
  const register = vi.fn().mockResolvedValue(undefined);

  return {
    environment: {
      readyState,
      addLoadListener,
      removeLoadListener,
      addUserInteractionListener,
      removeUserInteractionListener,
      requestIdleCallback: supportsIdle ? requestIdleCallback : null,
      cancelIdleCallback: supportsIdle ? cancelIdleCallback : null,
      setTimeout,
      clearTimeout,
      register,
    },
    addLoadListener,
    removeLoadListener,
    addUserInteractionListener,
    removeUserInteractionListener,
    requestIdleCallback,
    cancelIdleCallback,
    setTimeout,
    clearTimeout,
    register,
    get loadListener() {
      return loadListener;
    },
    get idleCallback() {
      return idleCallback;
    },
    get interactionListener() {
      return interactionListener;
    },
    get timeoutCallback() {
      return timeoutCallback;
    },
  };
}

function idleDeadline(): IdleDeadline {
  return {
    didTimeout: false,
    timeRemaining: () => 10,
  };
}
