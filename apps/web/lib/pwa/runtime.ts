export function isStandalonePwa(
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
  navigatorStandalone: boolean | undefined,
) {
  return (
    matchMedia?.("(display-mode: standalone)").matches === true || navigatorStandalone === true
  );
}
