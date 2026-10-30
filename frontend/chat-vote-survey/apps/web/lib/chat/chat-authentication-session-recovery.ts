import type { AccessTokenRecoveryResult } from "@/lib/auth/authenticated-fetch";

export const CHAT_AUTHENTICATION_RECOVERY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;

type RecoveryListener = () => void;
type RecoveryTimer = ReturnType<typeof setTimeout>;

export type ChatAuthenticationRecoveryPageTarget = Readonly<{
  addEventListener(type: "online" | "pageshow", listener: RecoveryListener): void;
  removeEventListener(type: "online" | "pageshow", listener: RecoveryListener): void;
}>;

export type ChatAuthenticationRecoveryVisibilityTarget = Readonly<{
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: RecoveryListener): void;
  removeEventListener(type: "visibilitychange", listener: RecoveryListener): void;
}>;

export type ChatAuthenticationSessionRecoveryStatus =
  "checking" | "authentication-required" | "temporarily-unavailable";

type ChatAuthenticationSessionRecoveryOptions = Readonly<{
  clearTimer?: (timer: RecoveryTimer) => void;
  onRecovered: () => void;
  onStatusChange: (status: ChatAuthenticationSessionRecoveryStatus) => void;
  pageTarget: ChatAuthenticationRecoveryPageTarget;
  recoverAccessToken: () => Promise<AccessTokenRecoveryResult>;
  setTimer?: (callback: () => void, delayMs: number) => RecoveryTimer;
  visibilityTarget: ChatAuthenticationRecoveryVisibilityTarget;
}>;

export type ChatAuthenticationSessionRecovery = Readonly<{
  dispose: () => void;
  retry: () => void;
}>;

export function attachChatAuthenticationSessionRecovery({
  clearTimer = clearTimeout,
  onRecovered,
  onStatusChange,
  pageTarget,
  recoverAccessToken,
  setTimer = setTimeout,
  visibilityTarget,
}: ChatAuthenticationSessionRecoveryOptions): ChatAuthenticationSessionRecovery {
  let active = true;
  let recoveryInFlight: Promise<void> | null = null;
  let retryIndex = 0;
  let retryTimer: RecoveryTimer | null = null;

  const clearRetryTimer = () => {
    if (retryTimer === null) {
      return;
    }

    clearTimer(retryTimer);
    retryTimer = null;
  };

  const runRecovery = () => {
    if (!active || recoveryInFlight) {
      return;
    }

    clearRetryTimer();
    onStatusChange("checking");

    recoveryInFlight = recoverAccessToken()
      .then((result) => {
        if (!active) {
          return;
        }

        if (result === "authenticated") {
          retryIndex = 0;
          onRecovered();
          return;
        }

        if (result === "authentication-required") {
          retryIndex = 0;
          onStatusChange("authentication-required");
          return;
        }

        onStatusChange("temporarily-unavailable");

        const delayMs = CHAT_AUTHENTICATION_RECOVERY_RETRY_DELAYS_MS[retryIndex];
        if (delayMs === undefined) {
          return;
        }

        retryIndex += 1;
        retryTimer = setTimer(() => {
          retryTimer = null;
          runRecovery();
        }, delayMs);
      })
      .catch(() => {
        if (active) {
          onStatusChange("temporarily-unavailable");
        }
      })
      .finally(() => {
        recoveryInFlight = null;
      });
  };

  const retry = () => {
    retryIndex = 0;
    runRecovery();
  };
  const handleVisibilityChange = () => {
    if (visibilityTarget.visibilityState === "visible") {
      retry();
    }
  };

  pageTarget.addEventListener("online", retry);
  pageTarget.addEventListener("pageshow", retry);
  visibilityTarget.addEventListener("visibilitychange", handleVisibilityChange);
  runRecovery();

  return {
    dispose: () => {
      if (!active) {
        return;
      }

      active = false;
      clearRetryTimer();
      pageTarget.removeEventListener("online", retry);
      pageTarget.removeEventListener("pageshow", retry);
      visibilityTarget.removeEventListener("visibilitychange", handleVisibilityChange);
    },
    retry,
  };
}
