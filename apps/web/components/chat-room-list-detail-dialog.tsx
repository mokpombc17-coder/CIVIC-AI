"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";
import type { ChatRoomListDetailSelection } from "@/components/chat-room-list-detail";
import { getChatRoomMemberCountPresentation } from "@/components/chat-room-publishing";
import { JoinChatRoomControl } from "@/components/join-chat-room-control";

export const CHAT_ROOM_LIST_DETAIL_DIALOG_ID = "chat-room-list-detail-dialog";

export function ChatRoomListDetailDialog({
  onClose,
  selection,
}: Readonly<{
  onClose: () => void;
  selection: ChatRoomListDetailSelection;
}>) {
  const titleId = useId();
  const { room } = selection;
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
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
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
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
      className="relative flex size-full items-end justify-center bg-[#121417]/[0.56] text-[var(--chat-publishing-color-text)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-[393px] rounded-t-xl border border-b-0 border-[var(--chat-publishing-color-border)] bg-white px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(18,20,23,0.2)]"
        data-chat-room-list-detail-dialog="true"
        id={CHAT_ROOM_LIST_DETAIL_DIALOG_ID}
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="flex min-h-11 items-start justify-between gap-4">
          <h2 className="min-w-0 pt-1 text-2xl font-bold leading-[32.4px]" id={titleId}>
            {room.name}
          </h2>
          <button
            aria-label="채팅방 상세 닫기"
            autoFocus
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={onClose}
            type="button"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/close.png" width={24} />
          </button>
        </div>

        <dl className="mt-2 grid gap-1.5">
          <RoomDetailRow label="카테고리">
            <ChatRoomCategoryBadges categories={room.categorySummaries} maxVisible={2} />
          </RoomDetailRow>
          <RoomDetailRow label="참여 인원">
            <span aria-label={memberCount.ariaLabel}>{memberCount.text}</span>
          </RoomDetailRow>
          <RoomDetailRow label="상세 설명" multiline>
            {room.description || "상세 설명이 없습니다."}
          </RoomDetailRow>
        </dl>

        <div className="mt-[18px] flex justify-end">
          {selection.kind === "participating" ? (
            <Link
              className="inline-flex h-12 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
              href={`/chat/${room.roomId}`}
            >
              입장하기
            </Link>
          ) : (
            <JoinChatRoomControl appearance="sheet" room={room} />
          )}
        </div>
      </section>
    </div>
  );
}

function RoomDetailRow({
  children,
  label,
  multiline = false,
}: Readonly<{
  children: ReactNode;
  label: string;
  multiline?: boolean;
}>) {
  return (
    <div
      className={`grid grid-cols-[90px_minmax(0,1fr)] gap-2 rounded-lg border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] px-3 ${
        multiline ? "min-h-[94px] items-start py-[10px]" : "h-[46px] items-center"
      }`}
    >
      <dt
        className={`text-[13px] font-medium leading-[19.5px] text-[var(--chat-publishing-color-muted)] ${
          multiline ? "pt-[3px]" : ""
        }`}
      >
        {label}
      </dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-base font-bold leading-6 text-[var(--chat-publishing-color-text)]">
        {children}
      </dd>
    </div>
  );
}
