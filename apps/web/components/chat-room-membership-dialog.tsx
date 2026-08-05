"use client";

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
      className="secondary-button shrink-0"
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      방 정보
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
      className="relative flex size-full items-center justify-center p-3 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-full w-full max-w-5xl overflow-y-auto rounded-2xl text-slate-950 shadow-2xl"
        data-chat-room-membership-dialog="true"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <ChatRoomMembershipPanel
          headerAction={
            <button
              aria-label="방 정보와 멤버십 닫기"
              autoFocus
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-100"
              onClick={onClose}
              type="button"
            >
              ×
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
