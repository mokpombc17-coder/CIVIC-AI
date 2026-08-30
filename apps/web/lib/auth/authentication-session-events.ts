export const AUTHENTICATION_SUCCEEDED_EVENT = "civic-ai:authentication-succeeded";
export const ACCESS_TOKEN_REFRESHED_EVENT = "civic-ai:access-token-refreshed";

type AuthenticationEventDispatcher = Pick<EventTarget, "dispatchEvent">;
type AuthenticationEventSubscriber = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function notifyAuthenticationSucceeded(target: AuthenticationEventDispatcher): void {
  target.dispatchEvent(new Event(AUTHENTICATION_SUCCEEDED_EVENT));
}

export function notifyAccessTokenRefreshed(target: AuthenticationEventDispatcher): void {
  target.dispatchEvent(new Event(ACCESS_TOKEN_REFRESHED_EVENT));
}

export function observeAuthenticationSucceeded(
  target: AuthenticationEventSubscriber,
  listener: () => void,
): () => void {
  const handleAuthenticationSucceeded = () => {
    listener();
  };

  target.addEventListener(AUTHENTICATION_SUCCEEDED_EVENT, handleAuthenticationSucceeded);

  return () => {
    target.removeEventListener(AUTHENTICATION_SUCCEEDED_EVENT, handleAuthenticationSucceeded);
  };
}

export function observeAccessTokenRefreshed(
  target: AuthenticationEventSubscriber,
  listener: () => void,
): () => void {
  const handleAccessTokenRefreshed = () => {
    listener();
  };

  target.addEventListener(ACCESS_TOKEN_REFRESHED_EVENT, handleAccessTokenRefreshed);

  return () => {
    target.removeEventListener(ACCESS_TOKEN_REFRESHED_EVENT, handleAccessTokenRefreshed);
  };
}
