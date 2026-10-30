export const PARTICIPANT_SWIPE_NAVIGATION_CONFIG = Object.freeze({
  cancelDurationMs: 180,
  directionRatio: 1.5,
  directionThresholdPx: 12,
  distanceThresholdPx: 80,
  exitDurationMs: 150,
  fastDistancePx: 40,
  fastVelocityPxPerMs: 0.5,
  followDurationMs: 70,
  maxVisualDragPx: 40,
  resistance: 0.35,
  softCapStartPx: 28,
});

export type ParticipantSwipeAxis = "horizontal" | "pending" | "vertical";
export type ParticipantSwipeDirection = "left" | "right";

export function classifyParticipantSwipe(deltaX: number, deltaY: number): ParticipantSwipeAxis {
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);

  if (Math.max(absoluteX, absoluteY) < PARTICIPANT_SWIPE_NAVIGATION_CONFIG.directionThresholdPx) {
    return "pending";
  }

  if (absoluteX > absoluteY * PARTICIPANT_SWIPE_NAVIGATION_CONFIG.directionRatio) {
    return "horizontal";
  }

  if (absoluteY > absoluteX) {
    return "vertical";
  }

  return "pending";
}

export function getParticipantSwipeVisualOffset(deltaX: number): number {
  const direction = Math.sign(deltaX);
  const resistedDistance = Math.abs(deltaX) * PARTICIPANT_SWIPE_NAVIGATION_CONFIG.resistance;
  const softCapStart = PARTICIPANT_SWIPE_NAVIGATION_CONFIG.softCapStartPx;

  if (resistedDistance <= softCapStart) {
    return deltaX * PARTICIPANT_SWIPE_NAVIGATION_CONFIG.resistance;
  }

  const softRange = PARTICIPANT_SWIPE_NAVIGATION_CONFIG.maxVisualDragPx - softCapStart;
  const overflow = resistedDistance - softCapStart;
  const softenedDistance = softCapStart + softRange * (1 - Math.exp(-overflow / softRange));

  return direction * softenedDistance;
}

export function isParticipantSwipeNavigationPath(pathname: string): boolean {
  return isPathWithin(pathname, "/chat") || isPathWithin(pathname, "/vote");
}

export function isParticipantSwipePointerSupported(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

export function shouldBlockParticipantSwipe(
  contentInert: boolean,
  blockingOverlayOpen: boolean,
): boolean {
  return contentInert || blockingOverlayOpen;
}

export function resolveParticipantSwipeDestination(
  pathname: string,
  direction: ParticipantSwipeDirection,
): string | null {
  if (isPathWithin(pathname, "/chat")) {
    return direction === "right" ? "/rag" : "/vote";
  }

  if (isPathWithin(pathname, "/vote")) {
    return direction === "right" ? "/chat" : "/mypage";
  }

  return null;
}

export function shouldCommitParticipantSwipe(distanceX: number, velocityX: number): boolean {
  const absoluteDistance = Math.abs(distanceX);

  if (absoluteDistance >= PARTICIPANT_SWIPE_NAVIGATION_CONFIG.distanceThresholdPx) {
    return true;
  }

  return (
    absoluteDistance >= PARTICIPANT_SWIPE_NAVIGATION_CONFIG.fastDistancePx &&
    Math.abs(velocityX) >= PARTICIPANT_SWIPE_NAVIGATION_CONFIG.fastVelocityPxPerMs &&
    Math.sign(distanceX) === Math.sign(velocityX)
  );
}

function isPathWithin(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}
