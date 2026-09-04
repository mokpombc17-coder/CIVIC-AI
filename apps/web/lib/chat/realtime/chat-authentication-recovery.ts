import type { ChatRealtimeTransport } from "./chat-realtime-transport";

type ChatAuthenticationRecoveryTransport = Pick<
  ChatRealtimeTransport,
  "getSnapshot" | "observe" | "reconnect"
>;

type ChatAuthenticationRecoveryOptions = Readonly<{
  ensureAccessToken: () => Promise<boolean>;
  onAuthenticationRecovered: () => void;
  onAuthenticationRequired: () => void;
}>;

export function attachChatAuthenticationRecovery(
  transport: ChatAuthenticationRecoveryTransport,
  {
    ensureAccessToken,
    onAuthenticationRecovered,
    onAuthenticationRequired,
  }: ChatAuthenticationRecoveryOptions,
): () => void {
  let attached = true;
  let recoveryAttemptedSinceConnection = false;
  let recoveryInFlight = false;
  let authenticationRequiredReported = false;

  const reportAuthenticationRequired = () => {
    if (authenticationRequiredReported) {
      return;
    }

    authenticationRequiredReported = true;
    onAuthenticationRequired();
  };

  const handleConnectionChange = () => {
    const snapshot = transport.getSnapshot();

    if (snapshot.status === "connected") {
      recoveryAttemptedSinceConnection = false;
      authenticationRequiredReported = false;
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

    void ensureAccessToken()
      .then((authenticated) => {
        if (!attached) {
          return;
        }

        if (!authenticated) {
          reportAuthenticationRequired();
          return;
        }

        onAuthenticationRecovered();

        if (transport.getSnapshot().status === "authentication-required") {
          transport.reconnect("authentication-succeeded");
        }
      })
      .catch(() => {
        if (attached) {
          reportAuthenticationRequired();
        }
      })
      .finally(() => {
        recoveryInFlight = false;
      });
  };

  const detach = transport.observe(handleConnectionChange);
  handleConnectionChange();

  return () => {
    attached = false;
    detach();
  };
}
