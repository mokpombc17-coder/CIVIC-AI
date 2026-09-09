const MOBILE_PRIMARY_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

type MatchMedia = (query: string) => Pick<MediaQueryList, "matches">;
type PreventableEvent = Pick<Event, "preventDefault">;

export function preventMobileLinkContextMenu(
  event: PreventableEvent,
  matchMedia: MatchMedia = window.matchMedia.bind(window),
): void {
  if (matchMedia(MOBILE_PRIMARY_POINTER_QUERY).matches) {
    event.preventDefault();
  }
}
