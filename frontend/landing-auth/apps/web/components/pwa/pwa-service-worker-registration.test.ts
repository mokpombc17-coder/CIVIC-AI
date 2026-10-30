import { describe, expect, it, vi } from "vitest";
import { schedulePwaServiceWorkerRegistration } from "./pwa-service-worker-registration";

describe("schedulePwaServiceWorkerRegistration", () => {
  it("registers immediately after load and the first trusted user interaction", () => {
    const harness = createRegistrationHarness("loading");
    const cleanup = schedulePwaServiceWorkerRegistration(harness.environment);

    expect(harness.register).not.toHaveBeenCalled();
    expect(harness.addLoadListener).toHaveBeenCalledOnce();
    expect(harness.addUserInteractionListener).not.toHaveBeenCalled();

    harness.loadListener?.();
    expect(harness.addUserInteractionListener).toHaveBeenCalledOnce();

    harness.interactionListener?.({ isTrusted: false });
    expect(harness.register).not.toHaveBeenCalled();

    harness.interactionListener?.({ isTrusted: true });
    expect(harness.removeUserInteractionListener).toHaveBeenCalledOnce();
    expect(harness.register).toHaveBeenCalledOnce();

    cleanup();
  });

  it("starts listening immediately when load already completed", () => {
    const harness = createRegistrationHarness("complete");

    schedulePwaServiceWorkerRegistration(harness.environment);

    expect(harness.addLoadListener).not.toHaveBeenCalled();
    expect(harness.addUserInteractionListener).toHaveBeenCalledOnce();
    expect(harness.register).not.toHaveBeenCalled();
  });

  it("registers only once when additional interaction events arrive", () => {
    const harness = createRegistrationHarness("complete");

    schedulePwaServiceWorkerRegistration(harness.environment);

    harness.interactionListener?.({ isTrusted: true });
    harness.interactionListener?.({ isTrusted: true });
    expect(harness.register).toHaveBeenCalledOnce();
  });

  it("removes pending interaction listeners when the component unmounts", () => {
    const harness = createRegistrationHarness("complete");
    const cleanup = schedulePwaServiceWorkerRegistration(harness.environment);

    cleanup();

    expect(harness.removeLoadListener).toHaveBeenCalledOnce();
    expect(harness.removeUserInteractionListener).toHaveBeenCalledOnce();
    harness.interactionListener?.({ isTrusted: true });
    expect(harness.register).not.toHaveBeenCalled();
  });
});

function createRegistrationHarness(readyState: DocumentReadyState) {
  let loadListener: (() => void) | undefined;
  let interactionListener: ((event: Pick<Event, "isTrusted">) => void) | undefined;
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
  const register = vi.fn().mockResolvedValue(undefined);

  return {
    environment: {
      readyState,
      addLoadListener,
      removeLoadListener,
      addUserInteractionListener,
      removeUserInteractionListener,
      register,
    },
    addLoadListener,
    removeLoadListener,
    addUserInteractionListener,
    removeUserInteractionListener,
    register,
    get loadListener() {
      return loadListener;
    },
    get interactionListener() {
      return interactionListener;
    },
  };
}
