"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { getChatRoomCategoryLabel } from "@/components/chat-room-category";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRequestedRef = useRef(false);
  const titleId = useId();
  const { room } = selection;
  const memberCount = getChatRoomMemberCountPresentation(room.activeMemberCount);

  function closeDialog() {
    const dialog = dialogRef.current;

    if (dialog?.open) {
      closeRequestedRef.current = true;
      dialog.close();
      return;
    }

    onClose();
  }

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    dialog.showModal();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-[var(--chat-publishing-color-text)] backdrop:bg-[#121417]/[0.56]"
      data-chat-room-list-detail-dialog="true"
      id={CHAT_ROOM_LIST_DETAIL_DIALOG_ID}
      onCancel={() => {
        closeRequestedRef.current = true;
      }}
      onClose={() => {
        if (!closeRequestedRef.current) {
          return;
        }

        closeRequestedRef.current = false;
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
      ref={dialogRef}
    >
      <section className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[393px] rounded-t-xl border border-b-0 border-[var(--chat-publishing-color-border)] bg-white px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(18,20,23,0.2)]">
        <div className="flex min-h-11 items-start justify-between gap-4">
          <h2 className="min-w-0 pt-1 text-2xl font-bold leading-[32.4px]" id={titleId}>
            {room.name}
          </h2>
          <button
            aria-label="채팅방 상세 닫기"
            autoFocus
            className="flex size-11 shrink-0 items-center justify-center rounded-[var(--chat-publishing-radius-control)] transition hover:bg-[var(--chat-publishing-color-neutral-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
            onClick={closeDialog}
            type="button"
          >
            <Image alt="" aria-hidden="true" height={24} src="/assets/chat/close.png" width={24} />
          </button>
        </div>

        <dl className="mt-2 grid gap-1.5">
          <RoomDetailRow label="카테고리">
            {room.categories.map(getChatRoomCategoryLabel).join(", ")}
          </RoomDetailRow>
          <RoomDetailRow label="참여 인원">
            <span aria-label={memberCount.ariaLabel}>{memberCount.text}</span>
          </RoomDetailRow>
          <RoomDetailRow label="상세 설명" multiline>
            {room.description || "상세 설명이 없습니다."}
          </RoomDetailRow>
        </dl>

        <div className="mt-[18px]">
          {selection.kind === "participating" ? (
            <Link
              className="inline-flex h-12 w-fit items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
              href={`/chat/${room.roomId}`}
            >
              채팅방 입장
            </Link>
          ) : (
            <JoinChatRoomControl appearance="sheet" room={room} />
          )}
        </div>
      </section>
    </dialog>
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
