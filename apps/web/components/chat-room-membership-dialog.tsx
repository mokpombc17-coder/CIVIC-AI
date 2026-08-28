"use client";

import Image from "next/image";
import { forwardRef, useId, type KeyboardEvent } from "react";
import { ChatRoomMembershipPanel } from "@/components/chat-room-membership-panel";
import type { RoomDetails } from "@/lib/chat/chat-room-contracts";

export const ChatRoomMembershipDialogTrigger = forwardRef<
  HTMLButtonElement,
  Readonly<{
    isOpen: boolean;
    onOpen: () => void;
  }>
>(function ChatRoomMembershipDialogTrigger({ isOpen, onOpen }, ref) {
  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label="채팅방 메뉴"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-publishing-color-text)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
        <path
          d="M4 7H20M4 12H20M4 17H20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </button>
  );
});

export function ChatRoomMembershipDialog({
  onClose,
  room,
  roomId,
}: Readonly<{
  onClose: () => void;
  room: RoomDetails;
  roomId: string;
}>) {
  const titleId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("dialog[open]")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    const first = focusableElements[0];
    const last = focusableElements.at(-1);

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="relative flex size-full items-end justify-center bg-[#121417]/[0.56]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[92%] w-full overflow-y-auto overscroll-contain rounded-t-xl border border-b-0 border-[var(--chat-publishing-color-border)] bg-white pb-[env(safe-area-inset-bottom)] text-[var(--chat-publishing-color-text)] shadow-[0_16px_40px_rgba(18,20,23,0.2)]"
        data-chat-room-membership-bottom-sheet="true"
        data-chat-room-membership-dialog="true"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <ChatRoomMembershipPanel
          headerAction={
            <button
              aria-label="채팅방 메뉴 닫기"
              autoFocus
              className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
              onClick={onClose}
              type="button"
            >
              <Image
                alt=""
                aria-hidden="true"
                height={24}
                src="/assets/chat/close.png"
                width={24}
              />
            </button>
          }
          headingId={titleId}
          room={room}
          roomId={roomId}
        />
      </section>
    </div>
  );
}
