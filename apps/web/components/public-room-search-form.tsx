"use client";

import Image from "next/image";
import { useId } from "react";
import {
  CHAT_ROOM_CATEGORY_OPTIONS,
  getChatRoomCategoryLabel,
} from "@/components/chat-room-category";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";
import type { RoomCategory } from "@/lib/chat/chat-room-contracts";

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
      <label className="grid min-w-0 gap-1.5 text-sm font-bold text-[var(--chat-publishing-color-text)]">
        채팅방 이름 검색
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
            inputMode="search"
            onChange={(event) => controller.setDraftQuery(event.currentTarget.value)}
            onCompositionEnd={controller.endComposition}
            onCompositionStart={controller.startComposition}
            placeholder="채팅방 이름을 입력해 주세요"
            type="search"
            value={controller.draftQuery}
          />
          <button
            className="h-[46px] shrink-0 bg-[var(--chat-publishing-color-primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={controller.isComposing}
            type="submit"
          >
            검색
          </button>
        </span>
      </label>

      <label className="grid gap-1.5 text-xs font-medium text-[var(--chat-publishing-color-muted)] sm:max-w-xs">
        카테고리
        <select
          className="h-11 rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-border)] bg-white px-3 text-sm text-[var(--chat-publishing-color-text)] outline-none transition focus:border-[var(--chat-publishing-color-primary)] focus:ring-2 focus:ring-[var(--chat-publishing-color-accent-soft)]"
          onChange={(event) => controller.setCategory(readCategory(event.currentTarget.value))}
          value={controller.category ?? ""}
        >
          <option value="">전체</option>
          {CHAT_ROOM_CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {getChatRoomCategoryLabel(category)}
            </option>
          ))}
        </select>
      </label>

      <p className="sr-only" id={helpId}>
        제목 검색은 검색 버튼을 누르면 적용되며, 카테고리 필터는 선택 즉시 적용됩니다.
      </p>
      {controller.validationMessage ? (
        <p className="text-sm font-medium text-red-700" id={errorId} role="alert">
          {controller.validationMessage}
        </p>
      ) : null}
    </form>
  );
}

function readCategory(value: string): RoomCategory | undefined {
  return CHAT_ROOM_CATEGORY_OPTIONS.find((category) => category === value);
}
