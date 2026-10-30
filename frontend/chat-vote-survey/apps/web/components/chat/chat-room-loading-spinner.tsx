"use client";

import { useEffect, useState } from "react";

export const CHAT_ROOM_LOADING_SPINNER_DELAY_MS = 300;

export function ChatRoomLoadingSpinner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), CHAT_ROOM_LOADING_SPINNER_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <span
      aria-hidden="true"
      className={`size-8 rounded-full border-[3px] border-[var(--chat-publishing-color-accent-soft)] border-t-[var(--chat-publishing-color-primary)] motion-safe:animate-spin motion-safe:transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      data-chat-room-loading-spinner="true"
      data-delay-ms={CHAT_ROOM_LOADING_SPINNER_DELAY_MS}
      data-visible={visible}
    />
  );
}
