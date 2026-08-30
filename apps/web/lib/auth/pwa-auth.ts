export type PwaAuthAction = "login" | "refresh" | "logout";

type PwaDisplayEnvironment = Readonly<{
  matchMedia?: (query: string) => Readonly<{ matches: boolean }>;
  navigatorStandalone?: boolean;
}>;

export function isInstalledPwa(environment: PwaDisplayEnvironment = browserEnvironment()): boolean {
  return (
    environment.matchMedia?.("(display-mode: standalone)").matches === true ||
    environment.navigatorStandalone === true
  );
}

export function authEndpoint(
  action: PwaAuthAction,
  installedPwa: boolean = isInstalledPwa(),
): string {
  return installedPwa ? `/api/v1/auth/pwa/${action}` : `/api/v1/auth/${action}`;
}

function browserEnvironment(): PwaDisplayEnvironment {
  const navigatorStandalone =
    typeof navigator !== "undefined" &&
    "standalone" in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return { matchMedia: window.matchMedia.bind(window), navigatorStandalone };
  }
  return { navigatorStandalone };
}
