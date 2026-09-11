export type PwaInstallChoice = Readonly<{
  outcome: "accepted" | "dismissed";
  platform: string;
}>;

export type BeforeInstallPromptEvent = Event &
  Readonly<{
    prompt: () => Promise<void>;
    userChoice: Promise<PwaInstallChoice>;
  }>;

export type PwaInstallNavigator = Readonly<{
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
}>;

export function isIosPwaInstallTarget(navigatorLike: PwaInstallNavigator): boolean {
  const userAgent = navigatorLike.userAgent?.toLowerCase() ?? "";
  const isClassicIosUserAgent = /iphone|ipad|ipod/.test(userAgent);
  const isIpadosDesktopMode =
    navigatorLike.platform === "MacIntel" && (navigatorLike.maxTouchPoints ?? 0) > 1;

  return isClassicIosUserAgent || isIpadosDesktopMode;
}

export function capturePwaInstallPrompt(event: Event): BeforeInstallPromptEvent {
  event.preventDefault();
  return event as BeforeInstallPromptEvent;
}

export async function requestPwaInstall(
  event: BeforeInstallPromptEvent,
): Promise<PwaInstallChoice> {
  await event.prompt();
  return event.userChoice;
}
