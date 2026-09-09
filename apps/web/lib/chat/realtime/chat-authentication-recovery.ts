import type { AccessTokenRecoveryResult } from "@/lib/auth/authenticated-fetch";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatAuthenticationRecoveryTransport = Pick<
  ChatRealtimeTransport,
  "getSnapshot" | "observe" | "reconnect"
>;

type ChatAuthenticationRecoveryOptions = Readonly<{
  recoverAccessToken: () => Promise<AccessTokenRecoveryResult>;
  onAuthenticationRecovered: () => void;
  onAuthenticationRequired: () => void;
}>;

export type ChatAuthenticationRecovery = Readonly<{
  authenticationRefreshed: () => void;
  detach: () => void;
  retry: () => void;
}>;

export function attachChatAuthenticationRecovery(
  transport: ChatAuthenticationRecoveryTransport,
  {
    recoverAccessToken,
    onAuthenticationRecovered,
    onAuthenticationRequired,
  }: ChatAuthenticationRecoveryOptions,
): ChatAuthenticationRecovery {
  let attached = true;
  let recoveryAttemptedSinceConnection = false;
  let recoveryInFlight = false;
  let authenticationRequiredReported = false;
  let reconnectRequested = false;

  const reportAuthenticationRequired = () => {
    if (authenticationRequiredReported) {
      return;
    }

    authenticationRequiredReported = true;
    onAuthenticationRequired();
  };

  const reconnectAfterAuthentication = () => {
    if (reconnectRequested) {
      return;
    }

    reconnectRequested = true;
    onAuthenticationRecovered();
    transport.reconnect("authentication-succeeded");
  };

  const handleConnectionChange = () => {
    const snapshot = transport.getSnapshot();

    if (snapshot.status === "connected") {
      recoveryAttemptedSinceConnection = false;
      authenticationRequiredReported = false;
      reconnectRequested = false;
      return;
    }

    if (snapshot.status !== "authentication-required" || recoveryInFlight) {
      return;
    }

    if (recoveryAttemptedSinceConnection) {
      reportAuthenticationRequired();
      return;
    }

    recoveryAttemptedSinceConnection = true;
    recoveryInFlight = true;

    void recoverAccessToken()
      .then((result) => {
        if (!attached) {
          return;
        }

        if (result === "authentication-required") {
          reportAuthenticationRequired();
          return;
        }

        if (result === "temporarily-unavailable") {
          recoveryAttemptedSinceConnection = false;
          return;
        }

        reconnectAfterAuthentication();
      })
      .catch(() => {
        recoveryAttemptedSinceConnection = false;
      })
      .finally(() => {
        recoveryInFlight = false;
      });
  };

  const detach = transport.observe(handleConnectionChange);
  handleConnectionChange();

  return {
    authenticationRefreshed: reconnectAfterAuthentication,
    detach: () => {
      attached = false;
      detach();
    },
    retry: () => {
      if (!attached || recoveryInFlight) {
        return;
      }

      recoveryAttemptedSinceConnection = false;
      authenticationRequiredReported = false;
      reconnectRequested = false;
      handleConnectionChange();
    },
  };
}
