"use client";

import { useEffect } from "react";
import {
  classifyParticipantSwipe,
  getParticipantSwipeVisualOffset,
  isParticipantSwipeNavigationPath,
  PARTICIPANT_SWIPE_NAVIGATION_CONFIG,
  resolveParticipantSwipeDestination,
  shouldBlockParticipantSwipe,
  shouldCommitParticipantSwipe,
  type ParticipantSwipeAxis,
  type ParticipantSwipeDirection,
} from "@/components/participant-swipe-navigation";

const CONTENT_SELECTOR = '[data-platform-shell-content="true"]';
const NAVIGATION_ROUTE_SELECTOR = "[data-platform-navigation-route]";
const RECENT_VELOCITY_WINDOW_MS = 100;
const EXIT_GAP_PX = 24;

type ActiveGesture = {
  axis: ParticipantSwipeAxis;
  lastTime: number;
  lastX: number;
  pointerId: number;
  recentTime: number;
  recentX: number;
  startX: number;
  startY: number;
};

type ParticipantSwipeNavigationControllerProps = Readonly<{
  currentPathname: string;
}>;

export function ParticipantSwipeNavigationController({
  currentPathname,
}: ParticipantSwipeNavigationControllerProps) {
  useEffect(() => {
    if (!isParticipantSwipeNavigationPath(currentPathname)) {
      return;
    }

    const activeNavigationCandidate = document.querySelector<HTMLAnchorElement>(
      `${NAVIGATION_ROUTE_SELECTOR}[aria-current="page"]`,
    );
    const shellSurfaceCandidate = activeNavigationCandidate?.closest<HTMLElement>(
      '[data-platform-shell-surface="true"]',
    );
    const contentCandidate = shellSurfaceCandidate?.querySelector<HTMLElement>(CONTENT_SELECTOR);
    const shellCandidate = shellSurfaceCandidate?.closest<HTMLElement>(
      '[data-platform-shell="true"]',
    );

    if (!contentCandidate || !shellSurfaceCandidate || !shellCandidate) {
      return;
    }

    const content = contentCandidate;
    const shellSurface = shellSurfaceCandidate;
    const shell = shellCandidate;

    const initialStyles = {
      touchAction: content.style.touchAction,
      transform: content.style.transform,
      transition: content.style.transition,
      userSelect: content.style.userSelect,
      willChange: content.style.willChange,
    };
    let activeGesture: ActiveGesture | null = null;
    let animationPending = false;
    let animationTimer: number | null = null;
    let navigationTimer: number | null = null;
    let suppressNextClick = false;
    let clickSuppressionTimer: number | null = null;

    content.style.touchAction = "pan-y pinch-zoom";

    function clearAnimationTimer() {
      if (animationTimer !== null) {
        window.clearTimeout(animationTimer);
        animationTimer = null;
      }
    }

    function clearNavigationTimer() {
      if (navigationTimer !== null) {
        window.clearTimeout(navigationTimer);
        navigationTimer = null;
      }
    }

    function clearClickSuppressionTimer() {
      if (clickSuppressionTimer !== null) {
        window.clearTimeout(clickSuppressionTimer);
        clickSuppressionTimer = null;
      }
    }

    function restoreMotionStyles() {
      content.style.transform = initialStyles.transform;
      content.style.transition = initialStyles.transition;
      content.style.userSelect = initialStyles.userSelect;
      content.style.willChange = initialStyles.willChange;
      delete content.dataset.platformSwipeState;
    }

    function isBlockingOverlayOpen(): boolean {
      return shouldBlockParticipantSwipe(
        content.closest("[inert]") !== null,
        shell.querySelector('[data-platform-shell-overlay="true"]') !== null,
      );
    }

    function finishAnimation() {
      clearAnimationTimer();
      animationPending = false;
      restoreMotionStyles();
    }

    function cancelHorizontalGesture() {
      if (prefersReducedMotion()) {
        finishAnimation();
        return;
      }

      animationPending = true;
      content.dataset.platformSwipeState = "cancelling";
      content.style.transition = `transform ${PARTICIPANT_SWIPE_NAVIGATION_CONFIG.cancelDurationMs}ms ease-out`;
      content.style.transform = "translate3d(0, 0, 0)";
      clearAnimationTimer();
      animationTimer = window.setTimeout(
        finishAnimation,
        PARTICIPANT_SWIPE_NAVIGATION_CONFIG.cancelDurationMs + 50,
      );
    }

    function findNavigationTarget(destination: string): HTMLAnchorElement | null {
      const links = shellSurface.querySelectorAll<HTMLAnchorElement>(NAVIGATION_ROUTE_SELECTOR);

      return (
        Array.from(links).find((link) => link.dataset.platformNavigationRoute === destination) ??
        null
      );
    }

    function scheduleNavigation(target: HTMLAnchorElement) {
      clearNavigationTimer();
      navigationTimer = window.setTimeout(() => {
        navigationTimer = null;
        target.click();
      }, 0);
    }

    function exitToNavigationTarget(
      target: HTMLAnchorElement,
      direction: ParticipantSwipeDirection,
    ) {
      if (prefersReducedMotion()) {
        finishAnimation();
        scheduleNavigation(target);
        return;
      }

      animationPending = true;
      content.dataset.platformSwipeState = "exiting";
      content.style.transition = `transform ${PARTICIPANT_SWIPE_NAVIGATION_CONFIG.exitDurationMs}ms ease-out`;
      const exitDistance = content.getBoundingClientRect().width + EXIT_GAP_PX;
      const signedExitDistance = direction === "right" ? exitDistance : -exitDistance;
      content.style.transform = `translate3d(${signedExitDistance}px, 0, 0)`;
      clearAnimationTimer();
      animationTimer = window.setTimeout(() => {
        animationTimer = null;
        scheduleNavigation(target);
      }, PARTICIPANT_SWIPE_NAVIGATION_CONFIG.exitDurationMs);
    }

    function suppressTrailingClick() {
      suppressNextClick = true;
      clearClickSuppressionTimer();
      clickSuppressionTimer = window.setTimeout(() => {
        clickSuppressionTimer = null;
        suppressNextClick = false;
      }, 0);
    }

    function handleClick(event: MouseEvent) {
      if (!suppressNextClick) {
        return;
      }

      suppressNextClick = false;
      clearClickSuppressionTimer();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        activeGesture ||
        animationPending ||
        isBlockingOverlayOpen() ||
        !event.isPrimary ||
        event.button !== 0 ||
        !isSupportedPointer(event.pointerType)
      ) {
        return;
      }

      activeGesture = {
        axis: "pending",
        lastTime: event.timeStamp,
        lastX: event.clientX,
        pointerId: event.pointerId,
        recentTime: event.timeStamp,
        recentX: event.clientX,
        startX: event.clientX,
        startY: event.clientY,
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const gesture = activeGesture;

      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }

      if (isBlockingOverlayOpen()) {
        interruptForBlockingOverlay();
        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;

      if (gesture.axis === "pending") {
        gesture.axis = classifyParticipantSwipe(deltaX, deltaY);

        if (gesture.axis === "horizontal") {
          content.dataset.platformSwipeState = "dragging";
          content.style.transition = prefersReducedMotion()
            ? "none"
            : `transform ${PARTICIPANT_SWIPE_NAVIGATION_CONFIG.followDurationMs}ms linear`;
          content.style.userSelect = "none";
          content.style.willChange = "transform";
          window.getSelection()?.removeAllRanges();

          try {
            content.setPointerCapture(event.pointerId);
          } catch {
            // The active pointer may already have been cancelled by the browser.
          }
        }
      }

      if (gesture.axis !== "horizontal") {
        return;
      }

      event.preventDefault();
      gesture.recentTime = gesture.lastTime;
      gesture.recentX = gesture.lastX;
      gesture.lastTime = event.timeStamp;
      gesture.lastX = event.clientX;
      const visualOffset = getParticipantSwipeVisualOffset(deltaX);
      content.style.transform = `translate3d(${visualOffset}px, 0, 0)`;
    }

    function handlePointerUp(event: PointerEvent) {
      const gesture = activeGesture;

      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }

      if (isBlockingOverlayOpen()) {
        interruptForBlockingOverlay();
        return;
      }

      activeGesture = null;

      if (gesture.axis !== "horizontal") {
        return;
      }

      releasePointerCapture(content, event.pointerId);
      suppressTrailingClick();
      const distanceX = event.clientX - gesture.startX;
      const velocityX = calculateRecentVelocity(event, gesture);

      if (!shouldCommitParticipantSwipe(distanceX, velocityX)) {
        cancelHorizontalGesture();
        return;
      }

      const direction: ParticipantSwipeDirection = distanceX > 0 ? "right" : "left";
      const destination = resolveParticipantSwipeDestination(currentPathname, direction);
      const target = destination ? findNavigationTarget(destination) : null;

      if (!target) {
        cancelHorizontalGesture();
        return;
      }

      exitToNavigationTarget(target, direction);
    }

    function handlePointerCancel(event: PointerEvent) {
      const gesture = activeGesture;

      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }

      activeGesture = null;
      releasePointerCapture(content, event.pointerId);

      if (gesture.axis === "horizontal") {
        cancelHorizontalGesture();
      }
    }

    function handleDragStart(event: DragEvent) {
      if (activeGesture?.axis === "horizontal") {
        event.preventDefault();
      }
    }

    function interruptForBlockingOverlay() {
      if (activeGesture) {
        releasePointerCapture(content, activeGesture.pointerId);
        activeGesture = null;
      }

      clearAnimationTimer();
      clearNavigationTimer();
      animationPending = false;
      restoreMotionStyles();
    }

    const overlayObserver = new MutationObserver(() => {
      if (isBlockingOverlayOpen()) {
        interruptForBlockingOverlay();
      }
    });

    overlayObserver.observe(shellSurface, {
      attributeFilter: ["inert"],
      attributes: true,
    });
    overlayObserver.observe(shell, {
      childList: true,
    });

    content.addEventListener("pointerdown", handlePointerDown);
    content.addEventListener("pointermove", handlePointerMove, { passive: false });
    content.addEventListener("pointerup", handlePointerUp);
    content.addEventListener("pointercancel", handlePointerCancel);
    content.addEventListener("dragstart", handleDragStart);
    document.addEventListener("click", handleClick, true);

    return () => {
      content.removeEventListener("pointerdown", handlePointerDown);
      content.removeEventListener("pointermove", handlePointerMove);
      content.removeEventListener("pointerup", handlePointerUp);
      content.removeEventListener("pointercancel", handlePointerCancel);
      content.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("click", handleClick, true);
      overlayObserver.disconnect();
      clearAnimationTimer();
      clearNavigationTimer();
      clearClickSuppressionTimer();
      content.style.touchAction = initialStyles.touchAction;
      restoreMotionStyles();
    };
  }, [currentPathname]);

  return null;
}

function calculateRecentVelocity(event: PointerEvent, gesture: ActiveGesture): number {
  if (event.timeStamp - gesture.lastTime > RECENT_VELOCITY_WINDOW_MS) {
    return 0;
  }

  const elapsed = event.timeStamp - gesture.recentTime;
  return elapsed > 0 ? (event.clientX - gesture.recentX) / elapsed : 0;
}

function isSupportedPointer(pointerType: string): boolean {
  if (pointerType === "touch" || pointerType === "pen") {
    return true;
  }

  if (pointerType !== "mouse") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function releasePointerCapture(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // The browser may release capture before pointerup or pointercancel is observed.
  }
}
