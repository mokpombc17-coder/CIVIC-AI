import { platformNavigationHrefs, type PlatformNavigationHref } from "@/lib/platform-navigation";

export const participantSwipeDirectionRatio = 1.5;
export const participantSwipeDirectionSlop = 12;
export const participantSwipeDistanceThreshold = 80;
export const participantSwipeFastDistanceThreshold = 40;
export const participantSwipeVelocityThreshold = 0.5;
export const participantSwipeResistance = 0.35;
export const participantSwipeSoftCapStart = 28;
export const participantSwipeMaximumVisualDistance = 40;
export const participantSwipeBlockingOverlaySelector =
  'dialog[open], [aria-modal="true"], [data-swipe-navigation-blocking]';

export function hasParticipantSwipeBlockingOverlay(root: ParentNode): boolean {
  return root.querySelector(participantSwipeBlockingOverlaySelector) !== null;
}

export function normalizeParticipantLandingRoute(pathname: string): PlatformNavigationHref | null {
  const normalizedPathname = pathname.replace(/^\/account$/u, "/mypage");
  return platformNavigationHrefs.find((href) => href === normalizedPathname) ?? null;
}

export function participantSwipeDestination(
  currentRoute: PlatformNavigationHref,
  deltaX: number,
): PlatformNavigationHref | null {
  const currentIndex = platformNavigationHrefs.indexOf(currentRoute);
  if (currentIndex < 0 || deltaX === 0) return null;

  const targetIndex = currentIndex + (deltaX < 0 ? 1 : -1);
  return platformNavigationHrefs[targetIndex] ?? null;
}

export function participantSwipeVisualOffset(deltaX: number): number {
  const direction = Math.sign(deltaX);
  const resistedDistance = Math.abs(deltaX) * participantSwipeResistance;
  if (resistedDistance <= participantSwipeSoftCapStart) return deltaX * participantSwipeResistance;

  const softRange = participantSwipeMaximumVisualDistance - participantSwipeSoftCapStart;
  const overflow = resistedDistance - participantSwipeSoftCapStart;
  const softenedDistance =
    participantSwipeSoftCapStart + softRange * (1 - Math.exp(-overflow / softRange));

  return direction * softenedDistance;
}

export function isParticipantSwipeNavigation(deltaX: number, velocityX: number): boolean {
  const distance = Math.abs(deltaX);
  return (
    distance >= participantSwipeDistanceThreshold ||
    (distance >= participantSwipeFastDistanceThreshold &&
      Math.abs(velocityX) >= participantSwipeVelocityThreshold)
  );
}
