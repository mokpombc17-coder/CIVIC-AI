import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type TestEvent = {
  button: number;
  clientX: number;
  clientY: number;
  immediatePropagationStopped: boolean;
  isPrimary: boolean;
  pointerId: number;
  pointerType: string;
  preventDefault: () => void;
  propertyName?: string;
  stopImmediatePropagation: () => void;
  target?: unknown;
  timeStamp: number;
  type: string;
};

type Listener = (event: TestEvent) => void;

class TestEventTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, overrides: Partial<TestEvent> = {}) {
    const event: TestEvent = {
      button: 0,
      clientX: 0,
      clientY: 0,
      immediatePropagationStopped: false,
      isPrimary: true,
      pointerId: 1,
      pointerType: "touch",
      preventDefault: () => undefined,
      stopImmediatePropagation() {
        event.immediatePropagationStopped = true;
      },
      timeStamp: 0,
      type,
      ...overrides,
    };

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
    return event;
  }
}

class TestElement extends TestEventTarget {
  readonly capturedPointers = new Set<number>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {
    touchAction: "auto",
    transform: "",
    transition: "",
    userSelect: "",
    willChange: "",
  };
  shell: TestElement | null = null;

  closest(selector: string) {
    return selector === '[data-platform-shell="true"]' ? this.shell : null;
  }

  getBoundingClientRect() {
    return { width: 393 };
  }

  hasPointerCapture(pointerId: number) {
    return this.capturedPointers.has(pointerId);
  }

  querySelectorAll(): TestElement[] {
    return [];
  }

  releasePointerCapture(pointerId: number) {
    this.capturedPointers.delete(pointerId);
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointers.add(pointerId);
  }
}

class TestAnchor extends TestElement {
  clickCount = 0;

  constructor(
    route: string,
    private readonly active: boolean,
  ) {
    super();
    this.dataset.platformNavigationRoute = route;
  }

  click() {
    this.clickCount += 1;
  }

  getAttribute(name: string) {
    return name === "aria-current" && this.active ? "page" : null;
  }
}

function createHarness() {
  const bootstrap = readFileSync(
    join(__dirname, "..", "public", "assets", "participant-swipe-bootstrap.js"),
    "utf8",
  );
  const surface = new TestElement();
  const shell = new TestElement();
  const homeLink = new TestAnchor("/home", true);
  const ragLink = new TestAnchor("/rag", false);
  shell.querySelectorAll = () => [homeLink, ragLink];
  surface.shell = shell;

  const timers = new Map<number, () => void>();
  let nextHandle = 1;
  const windowTarget = new TestEventTarget() as TestEventTarget &
    Record<string, unknown> & {
      cancelAnimationFrame: (handle: number) => void;
      clearTimeout: (handle: number) => void;
      location: { hostname: string };
      matchMedia: () => { matches: boolean };
      requestAnimationFrame: (callback: () => void) => number;
      setTimeout: (callback: () => void, delay: number) => number;
    };
  windowTarget.location = { hostname: "localhost" };
  windowTarget.matchMedia = () => ({ matches: false });
  windowTarget.requestAnimationFrame = (callback) => {
    const handle = nextHandle++;
    callback();
    return handle;
  };
  windowTarget.cancelAnimationFrame = () => undefined;
  windowTarget.setTimeout = (callback) => {
    const handle = nextHandle++;
    timers.set(handle, callback);
    return handle;
  };
  windowTarget.clearTimeout = (handle) => timers.delete(handle);

  const documentTarget = {
    getSelection: () => ({ removeAllRanges: () => undefined }),
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector === '[data-participant-surface="true"]' ? [surface] : [],
  };
  const marks: string[] = [];

  runInNewContext(bootstrap, {
    document: documentTarget,
    HTMLAnchorElement: TestAnchor,
    HTMLElement: TestElement,
    performance: { mark: (name: string) => marks.push(name) },
    window: windowTarget,
  });

  const dispatchPointer = (
    type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
    clientX: number,
    clientY: number,
    timeStamp: number,
  ) => surface.dispatch(type, { clientX, clientY, timeStamp, type });
  const runTimers = () => {
    while (timers.size > 0) {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    }
  };

  return {
    bootstrapActive: () => Boolean(windowTarget.__civicParticipantSwipeBootstrap),
    dispatchPointer,
    dispatchReactReady: () =>
      windowTarget.dispatch("civic:participant-swipe-react-ready", {
        type: "civic:participant-swipe-react-ready",
      }),
    homeLink,
    marks,
    ragLink,
    runTimers,
    surface,
  };
}

describe("pre-hydration participant swipe takeover", () => {
  it("cleans up immediately when React becomes ready without an active gesture", () => {
    const harness = createHarness();

    expect(harness.bootstrapActive()).toBe(true);
    harness.dispatchReactReady();

    expect(harness.bootstrapActive()).toBe(false);
    expect(harness.surface.style.touchAction).toBe("auto");
  });

  it("keeps ownership through a successful swipe and navigates exactly once", () => {
    const harness = createHarness();

    harness.dispatchPointer("pointerdown", 240, 100, 0);
    harness.dispatchPointer("pointermove", 120, 100, 20);
    harness.dispatchReactReady();

    expect(harness.bootstrapActive()).toBe(true);
    harness.dispatchPointer("pointerup", 120, 100, 30);
    expect(harness.bootstrapActive()).toBe(true);

    harness.surface.dispatch("transitionend", {
      propertyName: "transform",
      target: harness.surface,
      type: "transitionend",
    });
    harness.surface.dispatch("transitionend", {
      propertyName: "transform",
      target: harness.surface,
      type: "transitionend",
    });
    harness.runTimers();

    expect(harness.ragLink.clickCount).toBe(1);
    expect(harness.bootstrapActive()).toBe(false);
    expect(harness.surface.capturedPointers.size).toBe(0);
  });

  it("waits for the cancel animation before cleaning up a cancelled gesture", () => {
    const harness = createHarness();

    harness.dispatchPointer("pointerdown", 240, 100, 0);
    harness.dispatchPointer("pointermove", 180, 100, 20);
    harness.dispatchReactReady();
    harness.dispatchPointer("pointercancel", 180, 100, 30);

    expect(harness.bootstrapActive()).toBe(true);
    expect(harness.surface.capturedPointers.size).toBe(0);
    harness.runTimers();

    expect(harness.bootstrapActive()).toBe(false);
    expect(harness.surface.style.transform).toBe("");
    expect(harness.ragLink.clickCount).toBe(0);
  });

  it("finishes a vertical gesture before applying the pending takeover", () => {
    const harness = createHarness();

    harness.dispatchPointer("pointerdown", 200, 100, 0);
    harness.dispatchPointer("pointermove", 196, 140, 20);
    harness.dispatchReactReady();

    expect(harness.bootstrapActive()).toBe(true);
    harness.dispatchPointer("pointerup", 196, 140, 30);

    expect(harness.bootstrapActive()).toBe(false);
    expect(harness.homeLink.clickCount).toBe(0);
    expect(harness.ragLink.clickCount).toBe(0);
  });
});
