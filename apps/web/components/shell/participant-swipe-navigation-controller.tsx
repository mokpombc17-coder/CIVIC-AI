"use client";

import { useEffect } from "react";
import type { PlatformNavigationHref } from "@/lib/platform-navigation";
import {
  isParticipantSwipeNavigation,
  normalizeParticipantLandingRoute,
  participantSwipeDestination,
  participantSwipeDirectionRatio,
  participantSwipeDirectionSlop,
  participantSwipeVisualOffset,
} from "@/lib/participant-swipe-navigation";

const participantSurfaceSelector = '[data-participant-surface="true"]';
const navigationRouteSelector = "[data-platform-navigation-route]";
const cancelDurationMs = 180;
const dragFollowDurationMs = 70;
const exitDurationMs = 150;
const recentVelocityWindowMs = 100;

type GestureIntent = "pending" | "horizontal" | "vertical";

type ActiveGesture = {
  intent: GestureIntent;
  lastTime: number;
  lastX: number;
  pointerId: number;
  previousTime: number;
  previousX: number;
  startX: number;
  startY: number;
};

export function ParticipantSwipeNavigationController({
  activeRoute,
}: Readonly<{ activeRoute: string }>) {
  useEffect(() => {
    const currentRoute = normalizeParticipantLandingRoute(activeRoute);
    const surface = document.querySelector<HTMLElement>(participantSurfaceSelector);
    if (!currentRoute || !surface) return;

    const originalInlineStyles = {
      touchAction: surface.style.touchAction,
      transform: surface.style.transform,
      transition: surface.style.transition,
      userSelect: surface.style.userSelect,
      willChange: surface.style.willChange,
    };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let gesture: ActiveGesture | null = null;
    let isNavigating = false;
    let animationFrame = 0;
    let navigationFallback = 0;
    let suppressClick = false;
    let suppressClickReset = 0;
    let removeTransitionListener: (() => void) | undefined;

    surface.style.touchAction = "pan-y pinch-zoom";

    const writeVisualOffset = (offset: number) => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        surface.style.transform = `translate3d(${offset}px, 0, 0)`;
      });
    };

    const clearTemporaryStyles = () => {
      surface.style.userSelect = originalInlineStyles.userSelect;
      surface.style.willChange = originalInlineStyles.willChange;
    };

    const cancelGesture = () => {
      surface.style.transition = reducedMotion
        ? "none"
        : `transform ${cancelDurationMs}ms ease-out`;
      writeVisualOffset(0);
      window.setTimeout(clearTemporaryStyles, reducedMotion ? 0 : cancelDurationMs);
    };

    const navigateTo = (targetRoute: PlatformNavigationHref, direction: number) => {
      const targetLink = findNavigationLink(targetRoute);
      if (!targetLink) {
        cancelGesture();
        return;
      }

      isNavigating = true;
      const finishNavigation = () => {
        window.clearTimeout(navigationFallback);
        removeTransitionListener?.();
        targetLink.click();
      };

      if (reducedMotion) {
        finishNavigation();
        return;
      }

      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target === surface && event.propertyName === "transform") finishNavigation();
      };
      surface.addEventListener("transitionend", handleTransitionEnd);
      removeTransitionListener = () =>
        surface.removeEventListener("transitionend", handleTransitionEnd);
      navigationFallback = window.setTimeout(finishNavigation, exitDurationMs + 50);

      surface.style.transition = `transform ${exitDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      const exitDistance = (surface.getBoundingClientRect().width + 24) * direction;
      writeVisualOffset(exitDistance);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        isNavigating ||
        gesture ||
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        !isSupportedPointer(event)
      ) {
        return;
      }

      surface.style.transition = "none";
      gesture = {
        intent: "pending",
        lastTime: event.timeStamp,
        lastX: event.clientX,
        pointerId: event.pointerId,
        previousTime: event.timeStamp,
        previousX: event.clientX,
        startX: event.clientX,
        startY: event.clientY,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId || isNavigating) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (gesture.intent === "pending") {
        if (Math.max(absoluteX, absoluteY) < participantSwipeDirectionSlop) return;
        if (absoluteX > absoluteY * participantSwipeDirectionRatio) {
          gesture.intent = "horizontal";
          surface.style.userSelect = "none";
          surface.style.willChange = "transform";
          surface.style.transition = reducedMotion
            ? "none"
            : `transform ${dragFollowDurationMs}ms linear`;
          surface.setPointerCapture?.(event.pointerId);
          document.getSelection()?.removeAllRanges();
        } else if (absoluteY > absoluteX) {
          gesture.intent = "vertical";
          clearTemporaryStyles();
        } else {
          return;
        }
      }

      if (gesture.intent !== "horizontal") return;

      event.preventDefault();
      suppressClick = true;
      gesture.previousX = gesture.lastX;
      gesture.previousTime = gesture.lastTime;
      gesture.lastX = event.clientX;
      gesture.lastTime = event.timeStamp;

      const destination = participantSwipeDestination(currentRoute, deltaX);
      writeVisualOffset(destination ? participantSwipeVisualOffset(deltaX) : 0);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const completedGesture = gesture;
      gesture = null;
      if (surface.hasPointerCapture?.(event.pointerId)) {
        surface.releasePointerCapture?.(event.pointerId);
      }

      if (completedGesture.intent !== "horizontal") {
        clearTemporaryStyles();
        return;
      }

      event.preventDefault();
      window.clearTimeout(suppressClickReset);
      suppressClickReset = window.setTimeout(() => {
        suppressClick = false;
      }, 0);

      if (event.type === "pointercancel") {
        cancelGesture();
        return;
      }

      const deltaX = event.clientX - completedGesture.startX;
      const destination = participantSwipeDestination(currentRoute, deltaX);
      const sampleDuration = completedGesture.lastTime - completedGesture.previousTime;
      const sampleAge = event.timeStamp - completedGesture.lastTime;
      const velocityX =
        sampleDuration > 0 && sampleAge <= recentVelocityWindowMs
          ? (completedGesture.lastX - completedGesture.previousX) / sampleDuration
          : 0;

      if (destination && isParticipantSwipeNavigation(deltaX, velocityX)) {
        navigateTo(destination, deltaX < 0 ? -1 : 1);
      } else {
        cancelGesture();
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleDragStart = (event: DragEvent) => {
      if (gesture) event.preventDefault();
    };

    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("pointermove", handlePointerMove, { passive: false });
    surface.addEventListener("pointerup", handlePointerEnd);
    surface.addEventListener("pointercancel", handlePointerEnd);
    surface.addEventListener("click", handleClick, true);
    surface.addEventListener("dragstart", handleDragStart);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(navigationFallback);
      window.clearTimeout(suppressClickReset);
      removeTransitionListener?.();
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerup", handlePointerEnd);
      surface.removeEventListener("pointercancel", handlePointerEnd);
      surface.removeEventListener("click", handleClick, true);
      surface.removeEventListener("dragstart", handleDragStart);
      Object.assign(surface.style, originalInlineStyles);
    };
  }, [activeRoute]);

  return null;
}

function findNavigationLink(targetRoute: PlatformNavigationHref): HTMLAnchorElement | undefined {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(navigationRouteSelector)).find(
    (link) => link.dataset.platformNavigationRoute === targetRoute,
  );
}

function isSupportedPointer(event: PointerEvent): boolean {
  if (event.pointerType === "touch" || event.pointerType === "pen") return true;
  if (event.pointerType !== "mouse") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
