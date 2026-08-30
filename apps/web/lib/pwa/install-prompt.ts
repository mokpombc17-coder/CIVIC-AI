export type PwaInstallChoice = Readonly<{
  outcome: "accepted" | "dismissed";
  platform: string;
}>;

export type BeforeInstallPromptEvent = Event &
  Readonly<{
    prompt: () => Promise<void>;
    userChoice: Promise<PwaInstallChoice>;
  }>;

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
