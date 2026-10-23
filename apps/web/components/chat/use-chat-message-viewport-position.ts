import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
  type ChatMessageViewportAnchor,
  findRenderedChatMessageAnchorElement,
} from "@/components/chat/chat-message-viewport-anchor";
import {
  type ChatMessageViewportJob,
  type ChatMessageViewportPositionEvent,
  type ChatMessageViewportPositionState,
  createChatMessageViewportPositionState,
  reduceChatMessageViewportPosition,
} from "@/components/chat/chat-message-viewport-position";
import {
  type ChatMessageViewportInitialScrollTarget,
  findChatMessageInitialScrollIndex,
} from "@/components/chat/chat-message-viewport-state";
import type { ChatMessageViewportItemViewModel } from "@/components/chat/chat-room-view-model";

const AT_END_THRESHOLD = 96;
const LATEST_SCROLL_SETTLE_FRAMES = 4;
const OLDER_SCROLL_SETTLE_FRAMES = 4;

export type ChatMessageViewportPositionCallbacks = Readonly<{
  onInitialPositionReady?: ((viewportKey: string) => void) | undefined;
  onJobSettled: () => void;
  onLatestReached: () => void;
  onViewportChanged: (change: Readonly<{ preserved: boolean }>) => void;
}>;

export type ChatMessageViewportPositionController = Readonly<{
  dispatchPosition: (event: ChatMessageViewportPositionEvent) => ChatMessageViewportPositionState;
  positionRef: RefObject<ChatMessageViewportPositionState>;
}>;

export function useChatMessageViewportPosition({
  initialScrollTarget,
  items,
  onInitialPositionReady,
  onJobSettled,
  onLatestReached,
  onViewportChanged,
  pendingAnchorRef,
  scrollElementRef,
  viewportContinuityKey,
  viewportKey,
  virtualizer,
}: ChatMessageViewportPositionCallbacks &
  Readonly<{
    initialScrollTarget: ChatMessageViewportInitialScrollTarget;
    items: readonly ChatMessageViewportItemViewModel[];
    pendingAnchorRef: RefObject<ChatMessageViewportAnchor | null>;
    scrollElementRef: RefObject<HTMLDivElement | null>;
    viewportContinuityKey: string;
    viewportKey: string;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
  }>): ChatMessageViewportPositionController {
  const positionRef = useRef<ChatMessageViewportPositionState>(
    createChatMessageViewportPositionState(),
  );
  const jobFramesRef = useRef<ChatMessageViewportScrollFrames>({
    scroll: null,
    settle: null,
  });
  const activeViewportContinuityKeyRef = useRef(viewportContinuityKey);
  const currentViewportKeyRef = useRef(viewportKey);
  const positionedViewportKeyRef = useRef<string | null>(null);
  const virtualizerRef = useRef(virtualizer);
  const itemsRef = useRef(items);
  const initialScrollTargetRef = useRef(initialScrollTarget);
  const callbacksRef = useRef<ChatMessageViewportPositionCallbacks>({
    onInitialPositionReady,
    onJobSettled,
    onLatestReached,
    onViewportChanged,
  });

  // 자동 이동은 여러 frame에 걸쳐 실행되므로 시작 시점이 아니라 실행 시점의 목록·진입 목표·콜백을 읽음
  // layout effect는 같은 commit의 effect보다 먼저 실행되므로 effect와 이벤트에서는 항상 최신 값을 읽음
  useLayoutEffect(() => {
    virtualizerRef.current = virtualizer;
    currentViewportKeyRef.current = viewportKey;
    itemsRef.current = items;
    initialScrollTargetRef.current = initialScrollTarget;
    callbacksRef.current = {
      onInitialPositionReady,
      onJobSettled,
      onLatestReached,
      onViewportChanged,
    };
  });

  const notifyInitialPositionReady = useCallback((positionedViewportKey: string) => {
    if (
      currentViewportKeyRef.current !== positionedViewportKey ||
      positionedViewportKeyRef.current === positionedViewportKey
    ) {
      return;
    }

    positionedViewportKeyRef.current = positionedViewportKey;
    callbacksRef.current.onInitialPositionReady?.(positionedViewportKey);
  }, []);

  const cancelJobFrames = useCallback(() => {
    const frames = jobFramesRef.current;

    if (frames.scroll !== null) {
      cancelAnimationFrame(frames.scroll);
    }

    if (frames.settle !== null) {
      cancelAnimationFrame(frames.settle);
    }

    jobFramesRef.current = {
      scroll: null,
      settle: null,
    };
  }, []);

  const startJobRef = useRef<(job: ChatMessageViewportJob) => void>(() => undefined);

  const dispatchPosition = useCallback(
    (event: ChatMessageViewportPositionEvent): ChatMessageViewportPositionState => {
      const previous = positionRef.current;
      const next = reduceChatMessageViewportPosition(previous, event);
      positionRef.current = next;

      if (next === previous) {
        return next;
      }

      if (next.job !== previous.job) {
        cancelJobFrames();

        if (next.job !== null) {
          startJobRef.current(next.job);
        }
      }

      if (next.phase === "settled" && next.pin === "pinned") {
        callbacksRef.current.onLatestReached();
      }

      if (previous.phase !== "settled" && next.phase === "settled") {
        notifyInitialPositionReady(currentViewportKeyRef.current);
      }

      return next;
    },
    [cancelJobFrames, notifyInitialPositionReady],
  );

  useLayoutEffect(() => {
    startJobRef.current = (job) => {
      const frames = jobFramesRef.current;

      const settleJob = (isAtEnd: boolean) => {
        dispatchPosition({
          type: "job-settled",
          isAtEnd,
          jobId: job.id,
        });
        callbacksRef.current.onJobSettled();
      };

      const runLatest = () => {
        frames.scroll = requestAnimationFrame(() => {
          frames.scroll = null;
          const latestIndex = itemsRef.current.length - 1;

          if (latestIndex < 0) {
            const scrollElement = scrollElementRef.current;
            settleJob(scrollElement === null || isChatMessageViewportAtEnd(scrollElement));
            return;
          }

          virtualizerRef.current.scrollToIndex(latestIndex, {
            align: "end",
          });

          const settleAtLatest = (remainingFrames: number) => {
            frames.settle = requestAnimationFrame(() => {
              frames.settle = null;
              const scrollElement = scrollElementRef.current;

              if (!scrollElement) {
                return;
              }

              scrollElement.scrollTop = scrollElement.scrollHeight;

              if (remainingFrames > 1) {
                settleAtLatest(remainingFrames - 1);
                return;
              }

              settleJob(true);
            });
          };

          settleAtLatest(LATEST_SCROLL_SETTLE_FRAMES);
        });
      };

      const runInitial = (byLatestIntent: boolean) => {
        const target = initialScrollTargetRef.current;

        if (byLatestIntent || target.kind === "latest") {
          runLatest();
          return;
        }

        frames.scroll = requestAnimationFrame(() => {
          frames.scroll = null;
          const items = itemsRef.current;
          const targetIndex = findChatMessageInitialScrollIndex(items, target);
          const targetRenderKey = targetIndex === null ? undefined : items[targetIndex]?.renderKey;

          if (targetIndex === null || !targetRenderKey) {
            const scrollElement = scrollElementRef.current;
            settleJob(scrollElement === null || isChatMessageViewportAtEnd(scrollElement));
            return;
          }

          virtualizerRef.current.scrollToIndex(targetIndex, {
            align: target.kind === "message" ? "center" : "start",
          });

          const settleAtTarget = (remainingFrames: number) => {
            frames.settle = requestAnimationFrame(() => {
              frames.settle = null;
              const scrollElement = scrollElementRef.current;

              if (!scrollElement) {
                return;
              }

              const targetElement = findRenderedChatMessageAnchorElement(
                scrollElement,
                targetRenderKey,
              );

              if (targetElement) {
                const currentOffset =
                  targetElement.getBoundingClientRect().top -
                  scrollElement.getBoundingClientRect().top;
                // 이동한 대화에서 최신 대화로 돌아갈 때 돌아가기 전 화면 맨 위에 있던 메시지를 같은 높이에 다시 놓음
                // 대화가 바뀌어도 사용자에게는 화면이 그대로 보이게 하기 위함
                const targetOffset =
                  target.kind === "message"
                    ? Math.max(
                        0,
                        (scrollElement.clientHeight -
                          targetElement.getBoundingClientRect().height) /
                          2,
                      )
                    : target.kind === "anchor"
                      ? target.offsetFromViewportTop
                      : 0;
                scrollElement.scrollTop += currentOffset - targetOffset;

                if (target.kind === "message") {
                  targetElement.focus({ preventScroll: true });
                }
              }

              if (remainingFrames > 1) {
                settleAtTarget(remainingFrames - 1);
                return;
              }

              settleJob(isChatMessageViewportAtEnd(scrollElement));
            });
          };

          settleAtTarget(LATEST_SCROLL_SETTLE_FRAMES);
        });
      };

      const runAnchor = () => {
        frames.scroll = requestAnimationFrame(() => {
          frames.scroll = null;
          const anchor = pendingAnchorRef.current;
          const anchorIndex =
            anchor === null
              ? -1
              : itemsRef.current.findIndex((item) => item.renderKey === anchor.renderKey);

          if (anchor === null || anchorIndex < 0) {
            const scrollElement = scrollElementRef.current;
            settleJob(scrollElement !== null && isChatMessageViewportAtEnd(scrollElement));
            return;
          }

          virtualizerRef.current.scrollToIndex(anchorIndex, {
            align: "start",
          });

          const settleAtAnchor = (remainingFrames: number) => {
            frames.settle = requestAnimationFrame(() => {
              frames.settle = null;
              const scrollElement = scrollElementRef.current;

              if (!scrollElement) {
                return;
              }

              const anchorElement = findRenderedChatMessageAnchorElement(
                scrollElement,
                anchor.renderKey,
              );

              if (!anchorElement) {
                if (remainingFrames > 1) {
                  settleAtAnchor(remainingFrames - 1);
                  return;
                }

                // 기준 항목을 찾지 못하면 대기 anchor를 남겨 다음 목록 변경 때 다시 복원함
                settleJob(isChatMessageViewportAtEnd(scrollElement));
                return;
              }

              const currentOffset =
                anchorElement.getBoundingClientRect().top -
                scrollElement.getBoundingClientRect().top;
              scrollElement.scrollTop += currentOffset - anchor.offsetFromViewportTop;
              pendingAnchorRef.current = null;
              settleJob(isChatMessageViewportAtEnd(scrollElement));
            });
          };

          settleAtAnchor(OLDER_SCROLL_SETTLE_FRAMES);
        });
      };

      switch (job.kind) {
        case "initial":
          runInitial(job.byLatestIntent);
          return;
        case "latest":
        case "resize":
          runLatest();
          return;
        case "anchor":
          runAnchor();
          return;
      }
    };
  }, [dispatchPosition, pendingAnchorRef, scrollElementRef]);

  useEffect(() => {
    const continuityChanged = activeViewportContinuityKeyRef.current !== viewportContinuityKey;
    activeViewportContinuityKeyRef.current = viewportContinuityKey;
    const position = dispatchPosition({
      type: "viewport-changed",
      continuityChanged,
    });
    const preserved = position.phase === "settled";

    if (preserved) {
      notifyInitialPositionReady(viewportKey);
    }

    callbacksRef.current.onViewportChanged({ preserved });
  }, [dispatchPosition, notifyInitialPositionReady, viewportContinuityKey, viewportKey]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let resizeFrame: number | null = null;

    const notifyViewportResized = () => {
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        dispatchPosition({ type: "viewport-resized" });
      });
    };

    window.addEventListener("resize", notifyViewportResized);
    visualViewport?.addEventListener("resize", notifyViewportResized);
    visualViewport?.addEventListener("scroll", notifyViewportResized);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(notifyViewportResized);
    const scrollElement = scrollElementRef.current;

    if (scrollElement) {
      resizeObserver?.observe(scrollElement);
    }

    return () => {
      window.removeEventListener("resize", notifyViewportResized);
      visualViewport?.removeEventListener("resize", notifyViewportResized);
      visualViewport?.removeEventListener("scroll", notifyViewportResized);
      resizeObserver?.disconnect();

      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }
    };
  }, [dispatchPosition, scrollElementRef]);

  useEffect(() => cancelJobFrames, [cancelJobFrames]);

  return { dispatchPosition, positionRef };
}

export function isChatMessageViewportAtEnd(scrollElement: HTMLDivElement): boolean {
  return (
    scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight <=
    AT_END_THRESHOLD
  );
}

type ChatMessageViewportScrollFrames = {
  scroll: number | null;
  settle: number | null;
};
