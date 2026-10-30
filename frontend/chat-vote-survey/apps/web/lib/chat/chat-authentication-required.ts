"use client";

export const CHAT_AUTHENTICATION_REQUIRED_MESSAGE =
  "로그인 정보가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.";

type ChatReturnLocation = Readonly<{
  hash: string;
  pathname: string;
  search: string;
}>;

type Listener = () => void;

const listeners = new Set<Listener>();
let authenticationRequired = false;

export function isChatAuthenticationRequired(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return Reflect.get(error, "status") === 401 || Reflect.get(error, "code") === "UNAUTHENTICATED";
}

export function isChatAuthenticationRequiredResponse(status: number, body: unknown): boolean {
  return (
    status === 401 ||
    (body !== null && typeof body === "object" && Reflect.get(body, "code") === "UNAUTHENTICATED")
  );
}

export function reportChatAuthenticationRequired(error: unknown): boolean {
  if (!isChatAuthenticationRequired(error)) {
    return false;
  }

  if (!authenticationRequired) {
    authenticationRequired = true;
    emitChange();
  }

  return true;
}

export function clearChatAuthenticationRequired(): void {
  if (!authenticationRequired) {
    return;
  }

  authenticationRequired = false;
  emitChange();
}

export function getChatAuthenticationRequiredSnapshot(): boolean {
  return authenticationRequired;
}

export function subscribeChatAuthenticationRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createChatLoginHref(location: ChatReturnLocation): string {
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function createCurrentChatLoginHref(): string {
  return createChatLoginHref(
    typeof window === "undefined" ? { hash: "", pathname: "/chat", search: "" } : window.location,
  );
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}
