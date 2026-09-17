export const AUTHENTICATION_BROADCAST_CHANNEL_NAME = "civic-ai:auth:v1";

export type AuthenticationBroadcastMessage = "LOGIN" | "LOGOUT";

type AuthenticationLifecycleCallbacks = Readonly<{
  onBfcacheRestore: () => void;
  onLogin: () => void;
  onLogout: () => void;
}>;

export function createAuthenticationLifecycleHandlers(
  callbacks: AuthenticationLifecycleCallbacks,
): Readonly<{
  handleMessage: (event: Pick<MessageEvent<unknown>, "data">) => void;
  handlePageShow: (event: Pick<PageTransitionEvent, "persisted">) => void;
}> {
  return {
    handleMessage(event) {
      if (event.data === "LOGIN") {
        callbacks.onLogin();
      } else if (event.data === "LOGOUT") {
        callbacks.onLogout();
      }
    },
    handlePageShow(event) {
      if (event.persisted) {
        callbacks.onBfcacheRestore();
      }
    },
  };
}
