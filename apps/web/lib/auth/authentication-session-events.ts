export const AUTHENTICATION_SUCCEEDED_EVENT = "civic-ai:authentication-succeeded";

type AuthenticationEventDispatcher = Pick<EventTarget, "dispatchEvent">;
type AuthenticationEventSubscriber = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function notifyAuthenticationSucceeded(target: AuthenticationEventDispatcher): void {
  target.dispatchEvent(new Event(AUTHENTICATION_SUCCEEDED_EVENT));
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
