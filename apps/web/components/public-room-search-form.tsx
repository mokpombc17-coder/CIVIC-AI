"use client";

import Image from "next/image";
import { useId } from "react";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";

type PublicRoomSearchFormProps = Readonly<{
  controller: PublicRoomSearchController;
}>;

export function PublicRoomSearchForm({ controller }: PublicRoomSearchFormProps) {
  const helpId = useId();
  const errorId = useId();
  const describedBy = [helpId, controller.validationMessage ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      aria-label="공개 채팅방 검색"
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        controller.applySearch();
      }}
      role="search"
    >
      <label className="grid min-w-0 gap-1.5 text-sm text-[var(--chat-publishing-color-text)]">
        <span className="font-bold">토론방 이름 검색</span>
        <span className="flex h-12 min-w-0 items-center overflow-hidden rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-muted)] bg-white transition focus-within:border-[var(--chat-publishing-color-primary)] focus-within:ring-2 focus-within:ring-[var(--chat-publishing-color-accent-soft)]">
          <Image
            alt=""
            aria-hidden="true"
            className="ml-3 size-6 shrink-0"
            height={24}
            src="/assets/chat/search.png"
            width={24}
          />
          <input
            aria-describedby={describedBy}
            aria-invalid={controller.validationMessage ? true : undefined}
            autoComplete="off"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[15px] text-[var(--chat-publishing-color-text)] outline-none placeholder:text-[#757575]"
            data-focus-outline="container"
            inputMode="search"
            onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
            onCompositionEnd={controller.endComposition}
            onCompositionStart={controller.startComposition}
            placeholder="주제를 검색해 보세요"
            type="search"
            value={controller.draftQuery}
          />
          <button
            className="h-[46px] shrink-0 cursor-pointer bg-[var(--chat-publishing-color-primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={controller.isComposing}
            type="submit"
          >
            검색
          </button>
        </span>
      </label>

      <p className="sr-only" id={helpId}>
        제목 검색은 검색 버튼을 누르면 적용됩니다.
      </p>
      {controller.validationMessage ? (
        <p className="text-sm font-medium text-red-700" id={errorId} role="alert">
          {controller.validationMessage}
        </p>
      ) : null}
    </form>
  );
}
